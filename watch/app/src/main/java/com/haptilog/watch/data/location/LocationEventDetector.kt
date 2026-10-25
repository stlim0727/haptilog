package com.haptilog.watch.data.location

/** Pure session-scoped detector. All durations and freshness use the monotonic clock. */
class LocationEventDetector(
    private val places: List<SavedPlace>,
    private val dwellMinutes: Int = 10,
    private val sessionStartElapsedMillis: Long = 0L
) {
    init { require(dwellMinutes in setOf(5, 10, 20, 30)) }

    data class Result(val accepted: Boolean, val retainPoint: Boolean = false, val events: List<LocationEvent> = emptyList())
    private data class Boundary(var inside: Boolean? = null, var candidate: Boolean? = null, var since: Long = 0)
    private val boundaries = mutableMapOf<String, Boundary>()
    private var previous: LocationSample? = null
    private var retained: LocationSample? = null
    private var dwellAnchor: LocationSample? = null
    private var dwellEmitted = false

    fun accept(sample: LocationSample, nowElapsedRealtimeMillis: Long): Result {
        val age = nowElapsedRealtimeMillis - sample.elapsedRealtimeMillis
        if (!validCoordinates(sample.latitude, sample.longitude) || !sample.accuracyMeters.isFinite() ||
            sample.accuracyMeters <= 0 || sample.accuracyMeters > MAX_ACCURACY_METERS ||
            sample.timestampMillis <= 0 || sample.elapsedRealtimeMillis < 0 || age !in 0..MAX_AGE_MILLIS ||
            sample.elapsedRealtimeMillis < sessionStartElapsedMillis
        ) return Result(false)

        val last = previous
        if (last != null) {
            val delta = sample.elapsedRealtimeMillis - last.elapsedRealtimeMillis
            if (delta <= 0) return Result(false)
            // Reject teleports while allowing ordinary road/rail travel and uncertainty in both fixes.
            val minimumTravel = (last.distanceTo(sample) - last.accuracyMeters - sample.accuracyMeters).coerceAtLeast(0.0)
            if (minimumTravel / (delta / 1000.0) > MAX_SPEED_METERS_PER_SECOND) return Result(false)
            if (delta > MAX_OBSERVATION_GAP_MILLIS) {
                boundaries.clear()
                dwellAnchor = null
                dwellEmitted = false
            }
        }
        previous = sample
        val events = mutableListOf<LocationEvent>()
        places.forEach { place ->
            val boundary = boundaries.getOrPut(place.id) { Boundary() }
            val distance = distanceMeters(sample.latitude, sample.longitude, place.latitude, place.longitude)
            // Both sides include the full accuracy circle; the dead band avoids GPS edge flapping.
            val observed = when {
                distance + sample.accuracyMeters <= place.radiusMeters -> true
                distance - sample.accuracyMeters >= place.radiusMeters + EXIT_HYSTERESIS_METERS -> false
                else -> null
            }
            if (observed == null || observed == boundary.inside) {
                boundary.candidate = null
            } else if (boundary.candidate != observed) {
                boundary.candidate = observed
                boundary.since = sample.elapsedRealtimeMillis
            } else if (sample.elapsedRealtimeMillis - boundary.since >= BOUNDARY_CONFIRM_MILLIS) {
                // An initial outside observation is a baseline, never an invented exit.
                if (observed || boundary.inside == true) {
                    events += LocationEvent(if (observed) LocationEventType.ENTER else LocationEventType.EXIT,
                        sample, place.id, place.name)
                }
                boundary.inside = observed
                boundary.candidate = null
            }
        }

        val anchor = dwellAnchor
        // Only a contained accuracy circle counts as evidence of dwelling within 100m.
        if (anchor == null || anchor.distanceTo(sample) + sample.accuracyMeters > DWELL_RADIUS_METERS) {
            dwellAnchor = sample
            dwellEmitted = false
        } else if (!dwellEmitted && sample.elapsedRealtimeMillis - anchor.elapsedRealtimeMillis >= dwellMinutes * 60_000L) {
            val place = places.firstOrNull { boundaries[it.id]?.inside == true }
            events += LocationEvent(LocationEventType.DWELL, sample, place?.id, place?.name,
                anchor.timestampMillis, sample.elapsedRealtimeMillis - anchor.elapsedRealtimeMillis)
            dwellEmitted = true
        }
        val kept = retained
        val retainPoint = kept == null || events.isNotEmpty() ||
            sample.elapsedRealtimeMillis - kept.elapsedRealtimeMillis >= STATIONARY_KEEP_MILLIS ||
            (sample.elapsedRealtimeMillis - kept.elapsedRealtimeMillis >= MIN_POINT_INTERVAL_MILLIS &&
                kept.distanceTo(sample) >= maxOf(MIN_POINT_DISTANCE_METERS, kept.accuracyMeters.toDouble(), sample.accuracyMeters.toDouble()))
        if (retainPoint) retained = sample
        return Result(true, retainPoint, events)
    }

    companion object {
        const val MAX_AGE_MILLIS = 120_000L
        const val MAX_ACCURACY_METERS = 100f
        const val MAX_OBSERVATION_GAP_MILLIS = 180_000L
        const val BOUNDARY_CONFIRM_MILLIS = 30_000L
        const val EXIT_HYSTERESIS_METERS = 25.0
        const val DWELL_RADIUS_METERS = 100.0
        const val MAX_SPEED_METERS_PER_SECOND = 80.0
        const val STATIONARY_KEEP_MILLIS = 5 * 60_000L
        const val MIN_POINT_INTERVAL_MILLIS = 30_000L
        const val MIN_POINT_DISTANCE_METERS = 50.0
    }
}
