package com.haptilog.watch.sync

import android.content.Context
import androidx.work.*
import com.haptilog.watch.data.location.RawLocationOutbox
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RawLocationSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        private val mutex = Mutex()
        @Volatile private var active: CloudClient? = null
        fun cancel(context: Context) {
            active?.cancelRequests()
            WorkManager.getInstance(context).cancelUniqueWork("raw-location-sync")
            WorkManager.getInstance(context).cancelUniqueWork("raw-location-safety")
        }
        fun schedule(context: Context) {
            if (RawLocationConsent.grant(context) == null || !CloudClient.configured) return
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build()
            val wm = WorkManager.getInstance(context)
            wm.enqueueUniqueWork("raw-location-sync", ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<RawLocationSyncWorker>().setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
            wm.enqueueUniquePeriodicWork("raw-location-safety", ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<RawLocationSyncWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).build())
        }

        /** ACK only exact server IDs/outcomes. Lost responses leave identical sources pending. */
        internal fun flush(outbox: RawLocationOutbox, client: RawLocationClient, grant: JSONObject, maySend: () -> Boolean) {
            val state = client.call("status")
            if (state.optString("consent_id") != grant.getString("consent_id") || client.owner != grant.getString("owner"))
                throw LocationSyncException("CONSENT_CONFLICT")
            val pending = outbox.pending()
            for (batch in pending.chunked(100)) {
                if (!maySend()) return
                val eligible = batch.filter { row ->
                    val sample = row.getJSONObject("sample")
                    val allowed = !row.isNull("grant") && row.getJSONObject("grant").toString() == grant.toString()
                    if (!allowed) outbox.acknowledge(sample.getString("id"), if (row.isNull("grant")) "local_only" else "consent_excluded")
                    allowed
                }
                if (eligible.isEmpty()) continue
                val samples = eligible.map { it.getJSONObject("sample") }
                val result = client.call("ingest", JSONObject().put("protocol_version", 1)
                    .put("consent_id", grant.getString("consent_id")).put("sync_epoch", state.getLong("sync_epoch"))
                    .put("samples", JSONArray(samples)))
                val results = result.getJSONArray("results")
                val expected = samples.map { it.getString("id") }.toSet()
                val returned = (0 until results.length()).map { results.getJSONObject(it) }
                check(returned.size == expected.size && returned.map { it.getString("id") }.toSet() == expected)
                check(returned.all { it.getString("outcome") in setOf("accepted", "idempotent", "expired", "deleted", "consent_excluded") })
                returned.forEach { outbox.acknowledge(it.getString("id"), it.getString("outcome")) }
            }
            outbox.prune()
        }
    }
    override suspend fun doWork(): Result = mutex.withLock { withContext(Dispatchers.IO) {
        val context = applicationContext
        val grant = RawLocationConsent.grant(context) ?: return@withContext Result.success()
        if (com.haptilog.watch.service.VoiceRecordingService.isRecording.value) return@withContext Result.retry()
        val api = CloudClient(context) { !isStopped && RawLocationConsent.grant(context)?.toString() == grant.toString() }
        active = api
        try {
            flush(RawLocationOutbox.get(context), RawLocationClient(api), grant) {
                !isStopped && RawLocationConsent.grant(context)?.toString() == grant.toString()
            }
            Result.success()
        } catch (e: CancellationException) { throw e }
        catch (e: LocationSyncException) {
            if (e.error in setOf("CONSENT_REQUIRED", "CONSENT_CONFLICT", "FORBIDDEN")) {
                if (RawLocationConsent.grant(context)?.toString() == grant.toString()) RawLocationConsent.clear(context)
                Result.success()
            } else if (e.error in setOf("INVALID_PAYLOAD", "CONTENT_CONFLICT")) Result.failure() else Result.retry()
        } catch (_: Exception) { Result.retry() }
        finally { active = null; api.cancelRequests() }
    } }
}
