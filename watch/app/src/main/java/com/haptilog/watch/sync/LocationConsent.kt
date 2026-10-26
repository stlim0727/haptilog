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

    /** The switch moved: stop in-flight sends, then push the new position before work can idle. */
    fun onCloudSwitchChanged(context: Context) {
        LocationSyncWorker.cancelActive()
        check(preferences(context).edit().putBoolean("reconcile_pending", true).commit())
        LocationSyncWorker.schedule(context)
    }

    /** Returns the state to work against, after the server flag agrees with the switch. */
    fun reconcile(context: Context, client: LocationSyncClient, snapshot: JSONObject): JSONObject {
        val state = snapshot.getJSONObject("state")
        val desired = enabled(context)
        val prefs = preferences(context)
        if (state.optBoolean("consent_enabled") == desired) {
            prefs.edit().remove("reconcile_pending").commit()
            return state
        }
        val next = client.call("consent", JSONObject().put("enabled", desired).put("backfill", desired)
            .put("expected_revision", state.getLong("consent_revision"))).getJSONObject("state")
        prefs.edit().remove("reconcile_pending").commit()
        // Places named while offline become the starting cloud collection; afterwards the cloud wins.
        if (!desired || prefs.getBoolean("places_imported", false)) return next
        return importPlaces(context, client, next, snapshot.getJSONArray("places"))
    }

    private fun importPlaces(context: Context, client: LocationSyncClient, state: JSONObject,
                             remotePlaces: JSONArray): JSONObject {
        val history = LocationHistoryRepository.get(context).state.value
        val remoteIds = (0 until remotePlaces.length()).map { remotePlaces.getJSONObject(it).getString("id") }.toSet()
        var next = state
        for (place in history.places.filterNot { it.id in remoteIds }) {
            next = client.call("put_place", JSONObject().put("expected_revision", next.getLong("places_revision"))
                .put("id", place.id).put("name", place.name).put("latitude", place.latitude)
                .put("longitude", place.longitude).put("radius_meters", place.radiusMeters)).getJSONObject("state")
        }
        // A brand-new cloud collection inherits the threshold the watch already worked to.
        if (remotePlaces.length() == 0 && next.getInt("threshold_minutes") != history.dwellMinutes) {
            next = client.call("set_threshold", JSONObject().put("expected_revision", next.getLong("places_revision"))
                .put("threshold_minutes", history.dwellMinutes)).getJSONObject("state")
        }
        check(preferences(context).edit().putBoolean("places_imported", true).commit())
        return next
    }
}
