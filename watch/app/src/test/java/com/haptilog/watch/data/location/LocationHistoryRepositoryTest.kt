package com.haptilog.watch.data.location

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = android.app.Application::class)
class LocationHistoryRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()
    private fun point(seconds: Long) = LocationSample(37.0, 127.0, 10f,
        System.currentTimeMillis() - 600_000L + seconds * 1000, seconds * 1000)

    @Test fun persistsLocalHistoryButNeverRestoresAnActiveSession() {
        val directory = temporary.newFolder()
        val repository = LocationHistoryRepository(directory)
        repository.addPlace(SavedPlace("home", "Home", 37.0, 127.0))
        repository.setDwellMinutes(5)
        assertFalse(repository.recordSample(point(0), 0))
        repository.startSession()
        for (seconds in 0L..300 step 60) assertTrue(repository.recordSample(point(seconds), seconds * 1000))
        val reloaded = LocationHistoryRepository(directory)
        assertEquals(repository.state.value.events, reloaded.state.value.events)
        assertEquals(repository.state.value.points, reloaded.state.value.points)
        assertEquals(5, reloaded.state.value.dwellMinutes)
        assertNull(reloaded.state.value.latestSample)
        assertFalse(reloaded.recordSample(point(360), 360_000))
    }

    @Test fun clearHistoryKeepsPlaceSettingsAndDoesNotTouchAudio() {
        val directory = temporary.newFolder()
        val audio = File(directory.parentFile, "recording.m4a").apply { writeText("raw audio") }
        val repository = LocationHistoryRepository(directory)
        repository.addPlace(SavedPlace("home", "Home", 37.0, 127.0))
        repository.startSession()
        repository.recordSample(point(0), 0)
        repository.stopSession()
        repository.clearHistory()
        val reloaded = LocationHistoryRepository(directory)
        assertTrue(reloaded.state.value.points.isEmpty())
        assertTrue(reloaded.state.value.events.isEmpty())
        assertEquals("Home", reloaded.state.value.places.single().name)
        assertEquals("raw audio", audio.readText())
    }

    @Test fun settingsCannotMutateAnActiveDetectorAndEditsUpsert() {
        val repository = LocationHistoryRepository(temporary.newFolder())
        val place = SavedPlace("home", "Home", 37.0, 127.0)
        repository.addPlace(place)
        repository.addPlace(place.copy(name = "New home"))
        assertEquals(1, repository.state.value.places.size)
        assertEquals("New home", repository.state.value.places.single().name)
        repository.startSession()
        assertThrows(IllegalStateException::class.java) { repository.addPlace(place) }
        assertThrows(IllegalStateException::class.java) { repository.removePlace(place.id) }
        assertThrows(IllegalStateException::class.java) { repository.clearHistory() }
        assertThrows(IllegalStateException::class.java) { repository.setDwellMinutes(20) }
        repository.stopSession()
        repository.setDwellMinutes(20)
        repository.removePlace(place.id)
        assertTrue(repository.state.value.places.isEmpty())
    }

    @Test fun retentionBoundsTimeAndCountsIndependently() {
        val now = System.currentTimeMillis()
        val old = point(0).copy(timestampMillis = now - LocationHistoryRepository.RETENTION_MILLIS - 1)
        val recent = (0..2_500).map { point(it.toLong()).copy(timestampMillis = now - 3_000 + it) }
        val events = recent.takeLast(600).map { LocationEvent(LocationEventType.ENTER, it) }
        val bounded = LocationHistoryRepository.retained(LocationHistorySnapshot(points = listOf(old) + recent,
            events = listOf(LocationEvent(LocationEventType.ENTER, old)) + events), now)
        assertEquals(2_000, bounded.points.size)
        assertEquals(500, bounded.events.size)
        assertEquals(recent.last(), bounded.points.last())
        assertFalse(bounded.points.contains(old))
    }

    @Test fun failedDiskCommitDoesNotPublishSettingsAsSaved() {
        val blockedDirectory = temporary.newFile()
        val repository = LocationHistoryRepository(blockedDirectory)
        assertThrows(IllegalStateException::class.java) { repository.setDwellMinutes(20) }
        assertEquals(10, repository.state.value.dwellMinutes)
    }

    @Test fun thinnedObservationStillUpdatesLiveLatestSample() {
        val repository = LocationHistoryRepository(temporary.newFolder())
        repository.startSession()
        val first = point(0)
        val next = point(60)
        repository.recordSample(first, 0)
        repository.recordSample(next, 60_000)
        assertEquals(listOf(first), repository.state.value.points)
        assertEquals(next, repository.state.value.latestSample)
        repository.stopSession()
        assertNull(repository.state.value.latestSample)
    }

    @Test fun pruningWhileStoppedRemovesExpiredPointsFromDisk() {
        val directory = temporary.newFolder()
        val repository = LocationHistoryRepository(directory)
        repository.addPlace(SavedPlace("home", "Home", 37.0, 127.0))
        repository.startSession()
        repository.recordSample(point(0), 0)
        repository.stopSession()
        repository.prune(System.currentTimeMillis() + LocationHistoryRepository.RETENTION_MILLIS)
        assertTrue(repository.state.value.points.isEmpty())
        val reloaded = LocationHistoryRepository(directory)
        assertTrue(reloaded.state.value.points.isEmpty())
        assertEquals(1, reloaded.state.value.places.size)
        assertFalse(File(directory, "history.json").readText().contains("accuracy_meters"))
    }
}
