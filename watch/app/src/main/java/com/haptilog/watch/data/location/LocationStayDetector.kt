package com.haptilog.watch.data.location

import java.util.UUID

/** Consumes only accepted, ordered session samples from LocationEventDetector. */
class LocationStayDetector(
    private val thresholdMinutes: Int = 10,
    private val sessionId: String = UUID.randomUUID().toString(),
) {
    init { require(thresholdMinutes in setOf(5, 10, 20, 30)) }
    private var anchor: LocationSample? = null
    private var previous: LocationSample? = null
    private var previousInside = false
    private var durationMillis = 0L
    private var outsideSince: Long? = null
    private var active: LocationStay? = null
    private var clockDiscontinuity = false

    fun accept(sample: LocationSample): List<LocationStay> {
        val changes = mutableListOf<LocationStay>()
        val last = previous
        if (last != null && sample.elapsedRealtimeMillis <= last.elapsedRealtimeMillis) return emptyList()
        if (last != null && sample.elapsedRealtimeMillis - last.elapsedRealtimeMillis > GAP_MILLIS) {
            finish(LocationStayEndReason.OBSERVATION_GAP, sample.timestampMillis)?.let(changes::add)
        }
        val origin = anchor
        if (origin == null) {
            begin(sample)
            return changes
        }
        if (last != null && kotlin.math.abs(
                (sample.timestampMillis - last.timestampMillis) -
                    (sample.elapsedRealtimeMillis - last.elapsedRealtimeMillis)) > 5_000L) clockDiscontinuity = true
        val distance = origin.distanceTo(sample)
        val inside = distance + sample.accuracyMeters <= RADIUS_METERS
        val outside = distance - sample.accuracyMeters > RADIUS_METERS
        if (inside) {
            outsideSince = null
            if (previousInside && last != null) durationMillis += sample.elapsedRealtimeMillis - last.elapsedRealtimeMillis
            if (active == null && durationMillis >= thresholdMinutes * 60_000L) {
                active = LocationStay(
                    sessionId = sessionId, startedAtMillis = origin.timestampMillis,
                    qualifiedAtMillis = sample.timestampMillis, lastObservedAtMillis = sample.timestampMillis,
                    observedDurationMillis = durationMillis, clockDiscontinuity = clockDiscontinuity,
                    representativeLatitude = origin.latitude, representativeLongitude = origin.longitude,
                    accuracyMeters = origin.accuracyMeters, thresholdMinutes = thresholdMinutes,
                )
                changes += active!!
            } else active?.let {
                active = it.copy(sourceRevision = it.sourceRevision + 1,
                    lastObservedAtMillis = sample.timestampMillis, observedDurationMillis = durationMillis,
                    clockDiscontinuity = clockDiscontinuity)
                changes += active!!
            }
        } else {
            // Before qualification, uncertainty breaks the continuous evidence required for a stay.
            if (active == null) {
                begin(sample)
                return changes
            }
            if (outside) {
                val since = outsideSince
                if (since == null) outsideSince = sample.elapsedRealtimeMillis
                else if (sample.elapsedRealtimeMillis - since >= MOVEMENT_CONFIRM_MILLIS) {
                    finish(LocationStayEndReason.MOVED, sample.timestampMillis)?.let(changes::add)
                    begin(sample)
                    return changes
                }
            } else outsideSince = null
        }
        previousInside = inside
        previous = sample
        return changes
    }

    /** A timer can expire a silent provider without waiting for another fix. */
    fun expire(nowElapsedRealtimeMillis: Long, nowMillis: Long): LocationStay? {
        val last = previous ?: return null
        return if (nowElapsedRealtimeMillis - last.elapsedRealtimeMillis > GAP_MILLIS)
            finish(LocationStayEndReason.OBSERVATION_GAP, nowMillis) else null
    }

    fun finish(reason: LocationStayEndReason, confirmedAtMillis: Long? = null): LocationStay? {
        val closed = active?.copy(clockDiscontinuity = clockDiscontinuity)?.closed(reason, confirmedAtMillis)
        anchor = null
        previous = null
        previousInside = false
        durationMillis = 0
        outsideSince = null
        active = null
        clockDiscontinuity = false
        return closed
    }

    private fun begin(sample: LocationSample) {
        anchor = sample
        previous = sample
        previousInside = sample.accuracyMeters <= RADIUS_METERS
        durationMillis = 0
        outsideSince = null
        clockDiscontinuity = false
    }

    companion object {
        const val GAP_MILLIS = 180_000L
        const val MOVEMENT_CONFIRM_MILLIS = 30_000L
        const val RADIUS_METERS = 100.0
    }
}
