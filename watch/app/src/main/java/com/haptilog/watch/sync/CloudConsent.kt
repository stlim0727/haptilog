package com.haptilog.watch.sync

import android.content.Context
import androidx.work.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Explicit declaration, not independent age verification. Local capture never depends on it. */
object CloudConsent {
    const val VERSION = "2026-10-18"
    fun accepted(context: Context) = context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE)
        .getString("consent_version", null) == VERSION

    fun send(client: CloudApi, enabled: Boolean) {
        val (token, _) = client.authenticate()
        client.request("/rest/v1/rpc/set_cloud_consent", "POST",
            JSONObject().put("p_enabled", enabled).put("p_adult", enabled).toString().toByteArray(), token)
    }
    @Synchronized fun enable(context: Context) {
        send(CloudClient(context), true)
        check(context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .putString("consent_version", VERSION).commit())
        RecordingSyncWorker.enable(context)
    }
    @Synchronized fun reconcile(context: Context): Boolean {
        val desired = RecordingSyncWorker.enabled(context)
        send(CloudClient(context), desired)
        return desired == RecordingSyncWorker.enabled(context)
    }
    fun disable(context: Context) {
        RecordingSyncWorker.disable(context)
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().remove("consent_version").commit()
        val request = OneTimeWorkRequestBuilder<ConsentRevocationWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork("cloud-consent-revocation", ExistingWorkPolicy.REPLACE, request)
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
