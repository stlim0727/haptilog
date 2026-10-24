package com.haptilog.watch.sync

import android.content.Context
import androidx.work.*
import com.haptilog.watch.data.RecordingFiles
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Durably processes deletion tombstones independent of upload sync consent.
 * When a user deletes a recording, the cloud copy must be moved to trash even if
 * background upload sync is currently disabled.
 */
class RecordingDeleteWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        fun schedule(context: Context) {
            if (!CloudClient.configured) return
            val directory = RecordingFiles.dir(context)
            val hasTombstones = directory.listFiles().orEmpty().any { it.name.startsWith("delete_") && it.extension == "json" }
            if (!hasTombstones) return
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<RecordingDeleteWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("recording-delete", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!CloudClient.configured) return@withContext Result.success()
        val directory = RecordingFiles.dir(applicationContext)
        val deleteFiles = directory.listFiles().orEmpty().filter { it.name.startsWith("delete_") && it.extension == "json" }
        if (deleteFiles.isEmpty()) return@withContext Result.success()

        val client = CloudClient(applicationContext)
        val deleter = RecordingDeleter(applicationContext)
        var hasTransientError = false

        for (file in deleteFiles) {
            if (isStopped) return@withContext Result.retry()
            val data = runCatching { RecordingFiles.read(file) }.getOrNull() ?: continue
            val id = data.optString("id")
            if (!RecordingFiles.validId(id)) {
                file.delete()
                continue
            }
            try {
                deleter.delete(id, file, client)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                hasTransientError = true
            }
        }

        if (hasTransientError) Result.retry() else Result.success()
    }
}
