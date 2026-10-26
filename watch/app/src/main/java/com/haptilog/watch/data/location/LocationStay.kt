package com.haptilog.watch.data.location

import java.util.UUID

enum class LocationStayStatus { ACTIVE, CLOSED }
enum class LocationStayEndReason {
    MOVED, OBSERVATION_GAP, USER_STOP, SESSION_TIMEOUT, PERMISSION_LOST,
    // Only read back from history written by builds that still required notifications; a blocked
    // notification shade no longer interrupts a session.
    LOCATION_DISABLED, NOTIFICATIONS_DISABLED, PROVIDER_ERROR, STORAGE_ERROR,
    SERVICE_DESTROYED, INTERRUPTED
}

/** Derived observation; neither timestamps nor coordinates prove a physical building visit. */
data class LocationStay(
    val id: String = UUID.randomUUID().toString(),
    val sessionId: String,
    val sourceRevision: Long = 1,
    val startedAtMillis: Long,
    val qualifiedAtMillis: Long,
    val lastObservedAtMillis: Long,
    val endConfirmedAtMillis: Long? = null,
    val observedDurationMillis: Long,
    val status: LocationStayStatus = LocationStayStatus.ACTIVE,
    val endReason: LocationStayEndReason? = null,
    val clockDiscontinuity: Boolean = false,
    val representativeLatitude: Double,
    val representativeLongitude: Double,
    val accuracyMeters: Float,
    val observationRadiusMeters: Double = 100.0,
    val thresholdMinutes: Int = 10,
) {
    fun closed(reason: LocationStayEndReason, confirmedAtMillis: Long? = null) = copy(
        sourceRevision = sourceRevision + 1,
        status = LocationStayStatus.CLOSED,
        endReason = reason,
        endConfirmedAtMillis = confirmedAtMillis,
        clockDiscontinuity = clockDiscontinuity ||
            (confirmedAtMillis != null && confirmedAtMillis < lastObservedAtMillis),
    )
}
