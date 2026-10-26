package com.haptilog.watch.data.location

import org.junit.Assert.*
import org.junit.Test

class LocationStayDetectorTest {
    private fun sample(seconds: Long, meters: Double = 0.0, accuracy: Float = 10f) =
        LocationSample(37.0 + meters / 111_195.0, 127.0, accuracy,
            1_700_000_000_000L + seconds * 1000, seconds * 1000)
    private fun qualify(detector: LocationStayDetector): LocationStay {
        for (seconds in 0L..240 step 60) assertTrue(detector.accept(sample(seconds)).isEmpty())
        return detector.accept(sample(300)).single()
    }

    @Test fun qualifiesUnregisteredStayAndUpdatesSameId() {
        val detector = LocationStayDetector(5, "session")
        val stay = qualify(detector)
        assertEquals(300_000L, stay.observedDurationMillis)
        assertEquals(sample(0).timestampMillis, stay.startedAtMillis)
        val update = detector.accept(sample(360)).single()
        assertEquals(stay.id, update.id)
        assertEquals(2L, update.sourceRevision)
        assertEquals(360_000L, update.observedDurationMillis)
    }

    @Test fun movementNeedsTwoConfidentSamplesAndDoesNotCreditOutsideTime() {
        val detector = LocationStayDetector(5)
        val stay = qualify(detector)
        assertTrue(detector.accept(sample(360, 200.0)).isEmpty())
        assertTrue(detector.accept(sample(389, 200.0)).isEmpty())
        val closed = detector.accept(sample(390, 200.0)).single()
        assertEquals(stay.id, closed.id)
        assertEquals(LocationStayEndReason.MOVED, closed.endReason)
        assertEquals(stay.lastObservedAtMillis, closed.lastObservedAtMillis)
        assertEquals(300_000L, closed.observedDurationMillis)
        assertEquals(sample(390).timestampMillis, closed.endConfirmedAtMillis)
    }

    @Test fun strictGapExpiresWithoutNewSampleAndRequiresFreshThreshold() {
        val detector = LocationStayDetector(5)
        val stay = qualify(detector)
        assertNull(detector.expire(480_000, sample(480).timestampMillis))
        val closed = detector.expire(480_001, sample(481).timestampMillis)!!
        assertEquals(LocationStayEndReason.OBSERVATION_GAP, closed.endReason)
        assertEquals(stay.lastObservedAtMillis, closed.lastObservedAtMillis)
        assertTrue(detector.accept(sample(600)).isEmpty())
        assertNull(detector.finish(LocationStayEndReason.USER_STOP))
    }

    @Test fun sampledGapClosesAndDoesNotCreditMissingTime() {
        val detector = LocationStayDetector(5)
        val stay = qualify(detector)
        val closed = detector.accept(sample(481)).single()
        assertEquals(stay.id, closed.id)
        assertEquals(LocationStayEndReason.OBSERVATION_GAP, closed.endReason)
        assertEquals(300_000L, closed.observedDurationMillis)
    }

    @Test fun uncertaintyDoesNotExtendObservedDuration() {
        val detector = LocationStayDetector(5)
        qualify(detector)
        assertTrue(detector.accept(sample(360, 100.0, 30f)).isEmpty())
        val resumed = detector.accept(sample(420)).single()
        assertEquals(300_000L, resumed.observedDurationMillis)
        assertEquals(sample(480).timestampMillis, detector.accept(sample(480)).single().lastObservedAtMillis)
        assertEquals(360_000L, detector.finish(LocationStayEndReason.USER_STOP)!!.observedDurationMillis)
    }

    @Test fun wallClockRegressionPreservesMonotonicDurationAndFlagsRecord() {
        val detector = LocationStayDetector(5)
        qualify(detector)
        val update = detector.accept(sample(360).copy(timestampMillis = sample(0).timestampMillis - 1)).single()
        assertTrue(update.clockDiscontinuity)
        assertEquals(360_000L, update.observedDurationMillis)
        assertTrue(detector.finish(LocationStayEndReason.USER_STOP)!!.clockDiscontinuity)
    }

    @Test fun stopAndNewSessionNeverShareIdentity() {
        val first = LocationStayDetector(5)
        val stay = qualify(first)
        val closed = first.finish(LocationStayEndReason.USER_STOP)!!
        assertEquals(LocationStayStatus.CLOSED, closed.status)
        assertNull(closed.endConfirmedAtMillis)
        assertNull(first.finish(LocationStayEndReason.USER_STOP))
        val next = qualify(LocationStayDetector(5))
        assertNotEquals(stay.id, next.id)
        assertNotEquals(stay.sessionId, next.sessionId)
    }
    @Test fun prolongedUncertaintySplitsStayDespiteRegularAcceptedSamples() {
        val detector = LocationStayDetector(5)
        val first = qualify(detector)
        for (seconds in listOf(360L, 420L, 480L)) {
            assertTrue(detector.accept(sample(seconds, 100.0, 30f)).isEmpty())
        }
        val closed = detector.accept(sample(481, 100.0, 30f)).single()
        assertEquals(first.id, closed.id)
        assertEquals(LocationStayEndReason.OBSERVATION_GAP, closed.endReason)
        assertEquals(first.lastObservedAtMillis, closed.lastObservedAtMillis)
        assertEquals(first.observedDurationMillis, closed.observedDurationMillis)
        // Returning to the old anchor starts new evidence, never bridges the unknown interval.
        assertTrue(detector.accept(sample(540)).isEmpty())
        for (seconds in 600L..780 step 60) assertTrue(detector.accept(sample(seconds)).isEmpty())
        val second = detector.accept(sample(840)).single()
        assertNotEquals(first.id, second.id)
        assertEquals(sample(540).timestampMillis, second.startedAtMillis)
    }

    @Test fun timerExpiresUncertainStayFromLastInsideEvidenceWithStrictBoundary() {
        val detector = LocationStayDetector(5)
        val first = qualify(detector)
        detector.accept(sample(360, 100.0, 30f))
        detector.accept(sample(420, 100.0, 30f))
        assertNull(detector.expire(480_000, sample(480).timestampMillis))
        val closed = detector.expire(480_001, sample(481).timestampMillis)!!
        assertEquals(first.id, closed.id)
        assertEquals(LocationStayEndReason.OBSERVATION_GAP, closed.endReason)
        assertEquals(first.lastObservedAtMillis, closed.lastObservedAtMillis)
    }

    @Test fun firstInsideSampleAfterLongUncertaintyStartsNewEvidenceInsteadOfReopeningStay() {
        val detector = LocationStayDetector(5)
        val first = qualify(detector)
        for (seconds in listOf(360L, 420L, 480L)) detector.accept(sample(seconds, 100.0, 30f))
        val changes = detector.accept(sample(481))
        assertEquals(1, changes.size)
        assertEquals(first.id, changes.single().id)
        assertEquals(LocationStayEndReason.OBSERVATION_GAP, changes.single().endReason)
        for (seconds in 541L..721 step 60) assertTrue(detector.accept(sample(seconds)).isEmpty())
        val next = detector.accept(sample(781)).single()
        assertNotEquals(first.id, next.id)
        assertEquals(sample(481).timestampMillis, next.startedAtMillis)
    }

    @Test fun insideObservationExactlyAtEvidenceGapBoundaryKeepsStayIdentity() {
        val detector = LocationStayDetector(5)
        val first = qualify(detector)
        detector.accept(sample(360, 100.0, 30f))
        detector.accept(sample(420, 100.0, 30f))
        val update = detector.accept(sample(480)).single()
        assertEquals(first.id, update.id)
        assertEquals(LocationStayStatus.ACTIVE, update.status)
        assertEquals(first.observedDurationMillis, update.observedDurationMillis)
    }

}
