package com.haptilog.watch.sync

import android.content.Context
import androidx.work.*
import com.haptilog.watch.data.RecordingFiles
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class RecordingSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        private val syncMutex = Mutex()
        fun enabled(context: Context) = CloudConsent.accepted(context) && context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).getBoolean("enabled", false)
        fun retry(context: Context, id: String) {
            if (!RecordingFiles.validId(id)) return
            val file = File(RecordingFiles.dir(context), "sync_$id.json")
            val state = if (file.exists()) runCatching { RecordingFiles.read(file) }.getOrNull() ?: return else JSONObject()
            state.put("status", "PENDING_SYNC").put("attempts", 0)
            state.remove("error")
            RecordingFiles.write(file, state)
            schedule(context)
        }
        fun disable(context: Context) {
            context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().putBoolean("enabled", false).commit()
            WorkManager.getInstance(context).cancelUniqueWork("recording-sync")
            WorkManager.getInstance(context).cancelUniqueWork("recording-sync-safety")
        }
        fun enable(context: Context) {
            context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().putBoolean("enabled", true).apply()
            schedule(context)
        }
        fun schedule(context: Context) {
            if (!enabled(context) || !CloudClient.configured) return
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build()
            val manager = WorkManager.getInstance(context)
            manager.enqueueUniqueWork("recording-sync", ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<RecordingSyncWorker>().setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
            manager.enqueueUniquePeriodicWork("recording-sync-safety", ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<RecordingSyncWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).build())
        }
    }
    override suspend fun doWork(): Result = syncMutex.withLock { withContext(Dispatchers.IO) {
        if (!enabled(applicationContext) || !CloudClient.configured) return@withContext Result.success()
        if (com.haptilog.watch.service.VoiceRecordingService.isRecording.value) return@withContext Result.retry()
        val directory = RecordingFiles.dir(applicationContext)
        var transientFailure = false
        for (file in directory.listFiles().orEmpty().filter { it.name.startsWith("meta_") && it.extension == "json" }) {
            if (isStopped || !enabled(applicationContext)) return@withContext Result.success()
            val meta = runCatching { RecordingFiles.read(file) }.getOrNull() ?: continue
            val id = meta.optString("id")
            if (!RecordingFiles.validId(id) || meta.optString("status") != "COMPLETED") continue
            val stateFile = File(directory, "sync_$id.json")
            val state = try { if (stateFile.exists()) RecordingFiles.read(stateFile) else JSONObject() } catch (_: Exception) { continue }
            if (state.optString("status") in listOf("SYNCED", "ACTION_REQUIRED")) continue
            val audio = File(directory, "rec_$id.m4a")
            try {
                if (!audio.exists()) continue
                val client = CloudClient(applicationContext)
                currentCoroutineContext().ensureActive()
                val coroutineContext = currentCoroutineContext()
                RecordingUploader(applicationContext).upload(meta, state, stateFile, client) {
                    coroutineContext.ensureActive()
                    if (!enabled(applicationContext) || isStopped) throw CancellationException()
                }
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                val retry = e !is AuthSessionException && (e !is CloudException || e.status == 408 || e.status == 429 || e.status >= 500)
                val attempts = state.optInt("attempts") + 1
                state.put("attempts", attempts)
                val autoRetry = retry && attempts < 6
                state.put("status", if (autoRetry) "PENDING_SYNC" else "ACTION_REQUIRED")
                state.put("error", if (e is CloudException) "HTTP_${e.status}" else "CONNECTION_OR_SESSION_ERROR")
                runCatching { RecordingFiles.write(stateFile, state) }
                transientFailure = transientFailure || autoRetry
            }
        }
        if (transientFailure) Result.retry() else Result.success()
    } }
}
