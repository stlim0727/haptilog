package com.haptilog.watch.sync

import android.content.Context
import org.json.JSONObject

/** Location consent is deliberately independent of CloudConsent and audio sync. */
object LocationConsent {
    const val POLICY_VERSION = "2026-10-26"
    internal fun preferences(context: Context) = context.getSharedPreferences("location_sync", Context.MODE_PRIVATE)
    fun enabled(context: Context): Boolean = preferences(context).getBoolean("enabled", false) &&
        preferences(context).getString("policy_version", null) == POLICY_VERSION

    @Synchronized fun enable(context: Context, backfill: Boolean, api: CloudApi = CloudClient(context)) {
        val prefs = preferences(context)
        check(!prefs.getBoolean("revoke_pending", false)) { "Finish pending withdrawal before enabling" }
        val client = LocationSyncClient(api)
        val state = client.call("snapshot").getJSONObject("state")
        var nextState = client.call("consent", JSONObject().put("enabled", true).put("backfill", backfill)
            .put("expected_revision", state.getLong("consent_revision")))
            .getJSONObject("state")
        // First explicit opt-in imports existing saved places before downloading cloud settings.
        // Subsequent activations use the cloud collection, including its deletions.
        if (!prefs.getBoolean("ever_enabled", false)) {
            val snapshot = client.call("snapshot")
            val remote = snapshot.getJSONArray("places")
            val remoteIds = (0 until remote.length()).associateBy { remote.getJSONObject(it).getString("id") }
            for (place in com.haptilog.watch.data.location.LocationHistoryRepository.get(context).state.value.places) {
                if (place.id in remoteIds) {
                    val existing = remote.getJSONObject(remoteIds.getValue(place.id))
                    check(existing.getString("name") == place.name && existing.getDouble("latitude") == place.latitude &&
                        existing.getDouble("longitude") == place.longitude && existing.getDouble("radius_meters") == place.radiusMeters) {
                        "Saved place differs from cloud; review it in the portal"
                    }
                    continue
                }
                nextState = client.call("put_place", JSONObject().put("expected_revision", nextState.getLong("places_revision"))
                    .put("id", place.id).put("name", place.name).put("latitude", place.latitude)
                    .put("longitude", place.longitude).put("radius_meters", place.radiusMeters)).getJSONObject("state")
            }
            val threshold = com.haptilog.watch.data.location.LocationHistoryRepository.get(context).state.value.dwellMinutes
            if (state.getLong("places_revision") == 0L && nextState.getInt("threshold_minutes") != threshold) {
                client.call("set_threshold", JSONObject().put("expected_revision", nextState.getLong("places_revision"))
                    .put("threshold_minutes", threshold))
            }
        }
        check(prefs.edit().putBoolean("enabled", true).putString("policy_version", POLICY_VERSION)
            .putBoolean("ever_enabled", true).remove("checkpoint").commit())
        LocationSyncWorker.schedule(context)
    }

    /** Stops pending and in-flight sends before attempting an offline-capable withdrawal. */
    @Synchronized fun disable(context: Context) {
        check(preferences(context).edit().putBoolean("enabled", false)
            .putBoolean("revoke_pending", true).remove("checkpoint").commit())
        LocationSyncWorker.cancelActive()
        LocationSyncWorker.schedule(context)
    }
}
