package com.haptilog.watch.sync

import com.haptilog.watch.data.location.LocationStay
import com.haptilog.watch.data.location.LocationStayEndReason
import org.json.JSONObject
import java.time.Instant

class LocationSyncException(val error: String) : Exception("Location sync: $error")

/** Explicit allowlist: no raw points, legacy events, audio, or local monotonic timestamps. */
object LocationStayWire {
    fun encode(stay: LocationStay): JSONObject {
        require(!stay.clockDiscontinuity) { "Clock-discontinuous observations cannot be synced" }
        fun instant(value: Long) = Instant.ofEpochMilli(value).toString()
        val reason = when (stay.endReason) {
            null -> null
            LocationStayEndReason.MOVED -> "moved"
            LocationStayEndReason.OBSERVATION_GAP -> "observation_gap"
            LocationStayEndReason.INTERRUPTED, LocationStayEndReason.SERVICE_DESTROYED -> "interrupted"
            else -> "stopped"
        }
        return JSONObject().put("id", stay.id).put("session_id", stay.sessionId)
            .put("source_revision", stay.sourceRevision)
            .put("started_at", instant(stay.startedAtMillis))
            .put("qualified_at", instant(stay.qualifiedAtMillis))
            .put("last_observed_at", instant(stay.lastObservedAtMillis))
            .put("end_confirmed_at", stay.endConfirmedAtMillis?.let(::instant) ?: JSONObject.NULL)
            .put("observed_duration_millis", stay.observedDurationMillis)
            .put("status", stay.status.name.lowercase(java.util.Locale.ROOT))
            .put("end_reason", reason ?: JSONObject.NULL).put("clock_discontinuity", false)
            .put("representative_latitude", stay.representativeLatitude)
            .put("representative_longitude", stay.representativeLongitude)
            .put("accuracy_meters", stay.accuracyMeters)
            .put("observation_radius_meters", stay.observationRadiusMeters)
            .put("threshold_minutes", stay.thresholdMinutes)
    }
}

class LocationSyncClient(private val api: CloudApi) {
    private var credentials: Pair<String, String>? = null
    private var latestState: JSONObject? = null
    val consentRevision: Long get() = latestState!!.getLong("consent_revision")

    /**
     * Consent identity is the live server flag plus its upload cutoff window, not the CAS
     * token. A web edit or the watch's own reconcile can re-bump that token; adopting it never
     * revives data the cutoff already excludes. A flag this watch did not ask for is reported as
     * CONSENT_REQUIRED and [LocationConsent.reconcile] resolves it against the cloud switch.
     */
    fun ensureConsentCurrent() {
        val state = call("snapshot").getJSONObject("state")
        if (!state.getBoolean("consent_enabled")) throw LocationSyncException("CONSENT_REQUIRED")
        latestState = state
    }
    fun call(action: String, payload: JSONObject = JSONObject()): JSONObject {
        val (token, owner) = credentials ?: api.authenticate().also { credentials = it }
        val result = JSONObject(api.request("/rest/v1/rpc/location_stays", "POST",
            JSONObject().put("p_owner", owner).put("p_action", action).put("p_payload", payload)
                .toString().toByteArray(Charsets.UTF_8), token))
        if (result.has("error")) throw LocationSyncException(result.getString("error"))
        return result
    }
}
