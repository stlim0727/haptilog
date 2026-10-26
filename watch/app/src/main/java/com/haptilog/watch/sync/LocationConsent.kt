package com.haptilog.watch.sync

import android.content.Context
import com.haptilog.watch.data.location.LocationHistoryRepository
import org.json.JSONArray
import org.json.JSONObject

/**
 * There is no location-specific consent: sharing follows the cloud sync switch, and collecting the
 * journal is authorized by the OS location permission alone. The server consent flag is a mirror of
 * that switch, reconciled by [LocationSyncWorker] instead of a user press.
 */
object LocationConsent {
    internal fun preferences(context: Context) = context.getSharedPreferences("location_sync", Context.MODE_PRIVATE)
    fun enabled(context: Context): Boolean = RecordingSyncWorker.enabled(context)

    /** Preserve a withdrawal queued by a build that used the previous marker. */
    @Synchronized internal fun reconciliationPending(context: Context): Boolean {
        val prefs = preferences(context)
        if (prefs.contains("enabled") || prefs.contains("ever_enabled") || prefs.contains("revoke_pending")) {
            val edit = prefs.edit()
            if (prefs.getBoolean("revoke_pending", false) || prefs.getBoolean("enabled", false)) {
                edit.putBoolean("reconcile_pending", true)
            }
            // An old completed import also includes authoritative cloud deletions.
            if (prefs.getBoolean("ever_enabled", false)) edit.putBoolean("places_imported", true)
            check(edit.remove("enabled").remove("ever_enabled").remove("policy_version")
                .remove("revoke_pending").commit())
        }
        return prefs.getBoolean("reconcile_pending", false)
    }

    /** The switch moved: stop in-flight sends, then push the new position before work can idle. */
    @Synchronized fun onCloudSwitchChanged(context: Context) {
        LocationSyncWorker.cancelActive()
        val prefs = preferences(context)
        check(prefs.edit().putBoolean("reconcile_pending", true)
            .putLong("reconcile_generation", prefs.getLong("reconcile_generation", 0) + 1).commit())
        LocationSyncWorker.schedule(context)
    }

    /** Returns the state to work against, after the server flag agrees with the switch. */
    fun reconcile(context: Context, client: LocationSyncClient, snapshot: JSONObject): JSONObject {
        val state = snapshot.getJSONObject("state")
        val prefs = preferences(context)
        val (desired, generation) = synchronized(this) {
            reconciliationPending(context)
            enabled(context) to prefs.getLong("reconcile_generation", 0)
        }
        var next = if (state.optBoolean("consent_enabled") == desired) state else
            client.call("consent", JSONObject().put("enabled", desired).put("backfill", desired)
                .put("expected_revision", state.getLong("consent_revision"))).getJSONObject("state")
        // Places named while offline become the starting cloud collection; afterwards the cloud wins.
        // A previous attempt may have consented before its import failed.
        if (desired && !prefs.getBoolean("places_imported", false)) {
            next = importPlaces(context, client, next, snapshot.getJSONArray("places"))
        }
        synchronized(this) {
            if (prefs.getLong("reconcile_generation", 0) == generation && enabled(context) == desired) {
                check(prefs.edit().remove("reconcile_pending").commit())
            }
        }
        return next
    }

    /** A revision and its places must come from the same post-import snapshot. */
    internal fun reconciledSnapshot(context: Context, client: LocationSyncClient, snapshot: JSONObject): JSONObject {
        val before = snapshot.getJSONObject("state")
        val after = reconcile(context, client, snapshot)
        return if (after !== before) client.call("snapshot") else snapshot
    }

    private fun importPlaces(context: Context, client: LocationSyncClient, state: JSONObject,
                             remotePlaces: JSONArray): JSONObject {
        val history = LocationHistoryRepository.get(context).state.value
        val prefs = preferences(context)
        // Persist the bootstrap decision before any remote write: after a failed import the
        // cloud may no longer be empty, but its original local threshold still needs sending.
        if (!prefs.contains("import_threshold_minutes")) {
            check(prefs.edit().putInt("import_threshold_minutes",
                if (remotePlaces.length() == 0) history.dwellMinutes else -1).commit())
        }
        val threshold = prefs.getInt("import_threshold_minutes", -1)
        val remoteIds = (0 until remotePlaces.length()).map { remotePlaces.getJSONObject(it).getString("id") }.toSet()
        var next = state
        for (place in history.places.filterNot { it.id in remoteIds }) {
            next = client.call("put_place", JSONObject().put("expected_revision", next.getLong("places_revision"))
                .put("id", place.id).put("name", place.name).put("latitude", place.latitude)
                .put("longitude", place.longitude).put("radius_meters", place.radiusMeters)).getJSONObject("state")
        }
        // A brand-new cloud collection inherits the threshold the watch already worked to.
        if (threshold > 0 && next.getInt("threshold_minutes") != threshold) {
            next = client.call("set_threshold", JSONObject().put("expected_revision", next.getLong("places_revision"))
                .put("threshold_minutes", threshold)).getJSONObject("state")
        }
        check(prefs.edit().putBoolean("places_imported", true).remove("import_threshold_minutes").commit())
        return next
    }
}
