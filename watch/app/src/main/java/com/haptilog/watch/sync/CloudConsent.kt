package com.haptilog.watch.sync

import android.content.Context
import androidx.work.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Explicit declaration, not independent age verification. Local capture never depends on it. */
object CloudConsent {
    const val VERSION = "2026-10-26-unified"
    fun accepted(context: Context) = context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE)
        .getString("consent_version", null) == VERSION

    fun send(client: CloudApi, enabled: Boolean, places: org.json.JSONArray? = null, threshold: Int = 10) {
        val (token, _) = client.authenticate()
        client.request("/rest/v1/rpc/set_unified_cloud_consent", "POST",
            JSONObject().put("p_enabled", enabled).put("p_adult", enabled)
                .put("p_policy_version", VERSION).put("p_places", places ?: JSONObject.NULL)
                .put("p_threshold", threshold).toString().toByteArray(), token)
    }
    @Synchronized fun enable(context: Context, api: CloudApi = CloudClient(context)) {
        val prefs = LocationConsent.preferences(context)
        check(!prefs.getBoolean("revoke_pending", false)) { "Finish pending withdrawal before enabling" }
        val local = com.haptilog.watch.data.location.LocationHistoryRepository.get(context).state.value
        val places = if (!prefs.getBoolean("ever_enabled", false)) org.json.JSONArray(local.places.map { place ->
            JSONObject().put("id", place.id).put("name", place.name).put("latitude", place.latitude)
                .put("longitude", place.longitude).put("radius_meters", place.radiusMeters)
        }) else null
        // Consent and first-place import are one server transaction. No upload starts on failure.
        send(api, true, places, local.dwellMinutes)
        check(prefs.edit().putBoolean("ever_enabled", true).putBoolean("revoke_pending", false)
            .remove("checkpoint").remove("pending_places").commit())
        check(context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .putLong("generation", generation(context) + 1)
            .putString("consent_version", VERSION).putBoolean("enabled", true).commit())
        RecordingSyncWorker.schedule(context)
        LocationSyncWorker.schedule(context)
    }
    internal fun generation(context: Context) = context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE)
        .getLong("generation", 0)

    /** A response from before a newer explicit choice cannot undo that choice. */
    @Synchronized internal fun observeWithdrawal(context: Context, observedGeneration: Long) {
        if (generation(context) != observedGeneration) return
        RecordingSyncWorker.disable(context)
        RawLocationSyncWorker.cancel(context)
        RawLocationConsent.clear(context)
        check(context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .remove("consent_version").putLong("generation", observedGeneration + 1).commit())
    }

    @Synchronized fun reconcile(context: Context): Boolean {
        // A delayed withdrawal must never silently grant consent after a newer explicit enable.
        if (RecordingSyncWorker.enabled(context)) return true
        send(CloudClient(context), false)
        return !RecordingSyncWorker.enabled(context)
    }
    @Synchronized fun disable(context: Context) {
        RecordingSyncWorker.disable(context)
        RawLocationSyncWorker.cancel(context)
        RawLocationConsent.clear(context)
        LocationSyncWorker.cancelActive()
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .remove("consent_version").putLong("generation", generation(context) + 1).commit()
        val request = OneTimeWorkRequestBuilder<ConsentRevocationWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork("cloud-consent-revocation", ExistingWorkPolicy.REPLACE, request)
        RecordingDeleteWorker.schedule(context)
    }
}

class ConsentRevocationWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        // Reconcile the latest desired state; a later explicit re-enable wins.
        try {
            if (CloudConsent.reconcile(applicationContext)) Result.success() else Result.retry()
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (_: Exception) { Result.retry() }
    }
}
