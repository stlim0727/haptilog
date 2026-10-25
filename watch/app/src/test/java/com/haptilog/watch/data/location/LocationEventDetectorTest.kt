package com.haptilog.watch.data.location

import org.junit.Assert.*
import org.junit.Test

class LocationEventDetectorTest {
    private val place = SavedPlace("home", "Home", 37.0, 127.0)
    private fun sample(seconds: Long, northMeters: Double = 0.0, accuracy: Float = 10f) =
        LocationSample(37.0 + northMeters / 111_195.0, 127.0, accuracy,
            1_700_000_000_000L + seconds * 1000, seconds * 1000)
    private fun LocationEventDetector.feed(seconds: Long, meters: Double = 0.0, accuracy: Float = 10f) =
        accept(sample(seconds, meters, accuracy), seconds * 1000)

    @Test fun rejectsPoorStaleInvalidAndOutOfOrderObservations() {
        val detector = LocationEventDetector(emptyList())
        assertFalse(detector.feed(1, accuracy = 101f).accepted)
        assertFalse(detector.feed(2, accuracy = Float.NaN).accepted)
        assertFalse(detector.accept(sample(3), 124_000).accepted)
        assertFalse(detector.accept(sample(3), 2_000).accepted)
        assertFalse(detector.accept(sample(3).copy(latitude = Double.NaN), 3_000).accepted)
        assertTrue(detector.feed(5).accepted)
        assertFalse(detector.feed(5).accepted)
        assertFalse(detector.feed(4).accepted)
    }

    @Test fun requiresTwoConfidentObservationsBeforeEntryOrExit() {
        val detector = LocationEventDetector(listOf(place))
        assertTrue(detector.feed(0, 500.0).events.isEmpty())
        assertTrue(detector.feed(60, 500.0).events.isEmpty()) // baseline outside
        assertTrue(detector.feed(120).events.isEmpty())
        assertEquals(listOf(LocationEventType.ENTER), detector.feed(180).events.map { it.type })
        assertTrue(detector.feed(240).events.isEmpty())
        assertTrue(detector.feed(300, 500.0).events.isEmpty())
        assertEquals(listOf(LocationEventType.EXIT), detector.feed(360, 500.0).events.map { it.type })
        assertTrue(detector.feed(420, 500.0).events.isEmpty())
    }

    @Test fun uncertaintyAndHysteresisPreventBoundaryFlapping() {
        val detector = LocationEventDetector(listOf(place))
        detector.feed(0)
        assertEquals(LocationEventType.ENTER, detector.feed(60).events.single().type)
        listOf(190.0, 205.0, 220.0, 200.0).forEachIndexed { i, meters ->
            assertTrue(detector.feed(120L + i * 60, meters, accuracy = 30f).events.isEmpty())
        }
        assertTrue(detector.feed(360, 300.0).events.isEmpty())
        assertEquals(LocationEventType.EXIT, detector.feed(420, 300.0).events.single().type)
    }

    @Test fun burstObservationsCannotImmediatelyConfirmCrossing() {
        val detector = LocationEventDetector(listOf(place))
        detector.feed(0)
        assertTrue(detector.feed(1).events.isEmpty())
        assertTrue(detector.feed(29).events.isEmpty())
        assertEquals(LocationEventType.ENTER, detector.feed(30).events.single().type)
    }

    @Test fun dwellIsEmittedOncePerStayEvenWhenStationarySamplesAreThinned() {
        val detector = LocationEventDetector(emptyList(), dwellMinutes = 5)
        assertTrue(detector.feed(0).retainPoint)
        for (minute in 1L..4) {
            val result = detector.feed(minute * 60, 5.0)
            assertFalse(result.retainPoint)
            assertTrue(result.events.isEmpty())
        }
        val result = detector.feed(300)
        val dwell = result.events.single()
        assertEquals(LocationEventType.DWELL, dwell.type)
        assertEquals(300_000L, dwell.durationMillis)
        assertEquals(sample(0).timestampMillis, dwell.startedAtMillis)
        assertTrue(result.retainPoint)
        assertTrue(detector.feed(360).events.isEmpty())
        detector.feed(420, 300.0)
        for (seconds in 480L..660L step 60) detector.feed(seconds, 300.0)
        assertEquals(LocationEventType.DWELL, detector.feed(720, 300.0).events.single().type)
    }

    @Test fun missingObservationsCannotCountTowardDwellOrInventExit() {
        val detector = LocationEventDetector(listOf(place), dwellMinutes = 5)
        detector.feed(0)
        detector.feed(60)
        detector.feed(120)
        assertTrue(detector.feed(360, 500.0).events.isEmpty())
        assertTrue(detector.feed(420, 500.0).events.isEmpty())
        assertTrue(detector.feed(480, 500.0).events.isEmpty())
        assertTrue(detector.feed(540, 500.0).events.isEmpty())
        assertTrue(detector.feed(600, 500.0).events.isEmpty())
        assertEquals(LocationEventType.DWELL, detector.feed(660, 500.0).events.single().type)
    }

    @Test fun rejectsTeleportWithoutPoisoningNextGoodSample() {
        val detector = LocationEventDetector(emptyList())
        detector.feed(0)
        assertFalse(detector.feed(1, 50_000.0).accepted)
        assertTrue(detector.feed(60, 60.0).accepted)
    }

    @Test fun stationaryPointsAreBoundedButMovingPointsRemainUseful() {
        val detector = LocationEventDetector(emptyList())
        detector.feed(0)
        assertFalse(detector.feed(60, 20.0).retainPoint)
        assertTrue(detector.feed(120, 70.0).retainPoint)
        assertFalse(detector.feed(130, 130.0).retainPoint)
        assertTrue(detector.feed(180, 130.0).retainPoint)
        assertFalse(detector.feed(300, 130.0).retainPoint)
        assertTrue(detector.feed(480, 130.0).retainPoint)
    }

    @Test fun wallClockChangesDoNotChangeDwellDuration() {
        val detector = LocationEventDetector(emptyList(), dwellMinutes = 5)
        for (seconds in 0L..240 step 60) detector.feed(seconds)
        val result = detector.accept(sample(300).copy(timestampMillis = sample(0).timestampMillis - 60_000), 300_000)
        assertEquals(300_000L, result.events.single().durationMillis)
    }

    @Test fun sessionRestartRequiresNewBoundaryAndDwellEvidence() {
        val old = LocationEventDetector(listOf(place), 5)
        for (seconds in 0L..240 step 60) old.feed(seconds)
        val fresh = LocationEventDetector(listOf(place), 5)
        assertTrue(fresh.feed(300).events.isEmpty())
        assertEquals(LocationEventType.ENTER, fresh.feed(360).events.single().type)
        assertTrue(fresh.feed(420).events.isEmpty())
    }

    @Test fun placeLabelsAttachToDwellWithoutChangingObservedCoordinates() {
        val detector = LocationEventDetector(listOf(place), 5)
        for (seconds in 0L..240 step 60) detector.feed(seconds)
        val event = detector.feed(300, 5.0).events.single()
        assertEquals("home", event.placeId)
        assertEquals("Home", event.placeName)
        assertEquals(sample(300, 5.0), event.sample)
    }

    @Test fun preSessionCachedFixesAreExcludedFromInference() {
        val detector = LocationEventDetector(listOf(place), dwellMinutes = 5, sessionStartElapsedMillis = 100_000L)
        // Fix measured before session start (90s < 100s) must be rejected
        assertFalse(detector.feed(90).accepted)
        // Fix measured at or after session start (100s >= 100s) is accepted
        assertTrue(detector.feed(100).accepted)
    }
}
