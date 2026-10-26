package com.haptilog.watch.data.location

import java.util.UUID
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class LocationSample(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val timestampMillis: Long,
    val elapsedRealtimeMillis: Long
)

data class SavedPlace(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Double = 200.0
) {
    init {
        require(id.isNotBlank() && id.length <= 100)
        require(name.isNotBlank() && name.length <= 40)
        require(validCoordinates(latitude, longitude))
        require(radiusMeters.isFinite() && radiusMeters in 150.0..2_000.0)
    }
}

enum class LocationEventType { ENTER, EXIT, DWELL }

data class LocationEvent(
    val type: LocationEventType,
    val sample: LocationSample,
    val placeId: String? = null,
    val placeName: String? = null,
    val startedAtMillis: Long = sample.timestampMillis,
    val durationMillis: Long = 0,
    val id: String = UUID.randomUUID().toString()
)

data class LocationHistorySnapshot(
    val places: List<SavedPlace> = emptyList(),
    val points: List<LocationSample> = emptyList(),
    val events: List<LocationEvent> = emptyList(),
    val dwellMinutes: Int = 10,
    /** Latest accepted observation, not restored across sessions or boots. */
    val latestSample: LocationSample? = null,
    val stays: List<LocationStay> = emptyList()
)

internal fun validCoordinates(latitude: Double, longitude: Double) =
    latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0

/** Great-circle distance; clamping also handles round-off at antipodal points. */
internal fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val latDelta = Math.toRadians(lat2 - lat1)
    val lonDelta = Math.toRadians(lon2 - lon1)
    val a = sin(latDelta / 2) * sin(latDelta / 2) +
        cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(lonDelta / 2) * sin(lonDelta / 2)
    return 6_371_000.0 * 2 * asin(sqrt(a.coerceIn(0.0, 1.0)))
}

internal fun LocationSample.distanceTo(other: LocationSample) =
    distanceMeters(latitude, longitude, other.latitude, other.longitude)
