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
    @Test fun legacyVersionOneMigratesWithoutInventingStays() {
        val directory = temporary.newFolder()
        val original = LocationHistoryRepository(directory)
        original.addPlace(SavedPlace("home", "Home", 37.0, 127.0))
        original.setDwellMinutes(5)
        original.startSession()
        for (seconds in 0L..300 step 60) original.recordSample(point(seconds), seconds * 1000)
        original.stopSession()
        val file = File(directory, "history.json")
        val legacy = org.json.JSONObject(file.readText()).put("version", 1)
        legacy.remove("stays")
        file.writeText(legacy.toString())
        val restored = LocationHistoryRepository(directory)
        assertEquals(original.state.value.events, restored.state.value.events)
        assertEquals(original.state.value.points, restored.state.value.points)
        assertTrue(restored.state.value.stays.isEmpty())
        assertEquals(2, org.json.JSONObject(file.readText()).getInt("version"))
    }

    @Test fun recoveredActiveStayClosesInterruptedWithoutInventingEndTime() {
        val directory = temporary.newFolder()
        val repository = LocationHistoryRepository(directory)
        repository.setDwellMinutes(5)
        repository.startSession()
        for (seconds in 0L..300 step 60) repository.recordSample(point(seconds), seconds * 1000)
        val active = repository.state.value.stays.single()
        val recovered = LocationHistoryRepository(directory).state.value.stays.single()
        assertEquals(active.id, recovered.id)
        assertEquals(LocationStayStatus.CLOSED, recovered.status)
        assertEquals(LocationStayEndReason.INTERRUPTED, recovered.endReason)
        assertNull(recovered.endConfirmedAtMillis)
        assertEquals(active.sourceRevision + 1, recovered.sourceRevision)
        assertEquals(active.observedDurationMillis, recovered.observedDurationMillis)
    }

    @Test fun stopPersistsStayAndNewSessionUsesNewIdentity() {
        val directory = temporary.newFolder()
        val repository = LocationHistoryRepository(directory)
        repository.setDwellMinutes(5)
        repository.startSession()
        for (seconds in 0L..360 step 60) repository.recordSample(point(seconds), seconds * 1000)
        val active = repository.state.value.stays.single()
        assertEquals(2L, active.sourceRevision)
        repository.stopSession(LocationStayEndReason.SESSION_TIMEOUT, point(400).timestampMillis)
        val closed = LocationHistoryRepository(directory).state.value.stays.single()
        assertEquals(LocationStayEndReason.SESSION_TIMEOUT, closed.endReason)
        assertEquals(active.lastObservedAtMillis, closed.lastObservedAtMillis)
        repository.startSession(500_000)
        for (seconds in 500L..800 step 60) repository.recordSample(point(seconds), seconds * 1000)
        assertEquals(2, repository.state.value.stays.size)
        assertNotEquals(closed.sessionId, repository.state.value.stays.last().sessionId)
        repository.stopSession()
        repository.clearHistory()
        assertTrue(repository.state.value.stays.isEmpty())
    }

    @Test fun silentProviderExpiresStayButDoesNotExtendDuration() {
        val repository = LocationHistoryRepository(temporary.newFolder())
        repository.setDwellMinutes(5)
        repository.startSession()
        for (seconds in 0L..300 step 60) repository.recordSample(point(seconds), seconds * 1000)
        repository.expireStay(480_000, point(480).timestampMillis)
        assertEquals(LocationStayStatus.ACTIVE, repository.state.value.stays.single().status)
        repository.expireStay(480_001, point(481).timestampMillis)
        assertEquals(LocationStayEndReason.OBSERVATION_GAP, repository.state.value.stays.single().endReason)
        assertEquals(300_000L, repository.state.value.stays.single().observedDurationMillis)
    }

    @Test fun syncedPlacesAreDeferredWhileTrackingAndAppliedWhenStopped() {
        val repository = LocationHistoryRepository(temporary.newFolder())
        val places = listOf(SavedPlace("home", "Home", 37.0, 127.0))
        repository.startSession()
        assertFalse(repository.applySyncedPlaces(places, 20))
        assertTrue(repository.state.value.places.isEmpty())
        repository.stopSession()
        assertTrue(repository.applySyncedPlaces(places, 20))
        assertEquals(places, repository.state.value.places)
        assertEquals(20, repository.state.value.dwellMinutes)
    }

}
