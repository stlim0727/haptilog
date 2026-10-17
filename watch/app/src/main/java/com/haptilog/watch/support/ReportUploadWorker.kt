package com.haptilog.watch.support

import android.content.Context
import androidx.work.*
import com.haptilog.watch.service.VoiceRecordingService
import com.haptilog.watch.sync.CloudClient
import com.haptilog.watch.sync.CloudException
import com.haptilog.watch.sync.AuthSessionException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import java.util.concurrent.TimeUnit

class ReportUploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        fun schedule(context: Context) {
            if (!CloudClient.configured || AppReports.pending(context) == 0) return
            WorkManager.getInstance(context).enqueueUniqueWork("support-reports", ExistingWorkPolicy.APPEND_OR_REPLACE,
                OneTimeWorkRequestBuilder<ReportUploadWorker>()
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)
                        .setRequiresBatteryNotLow(true).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
        }
    }
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (VoiceRecordingService.isRecording.value) return@withContext Result.retry()
        try {
            coroutineScope {
                val allowed = { !isStopped && !VoiceRecordingService.isRecording.value }
                val client = CloudClient(applicationContext, allowed)
                val captureWatcher = launch(Dispatchers.Default) {
                    VoiceRecordingService.isRecording.collect { recording -> if (recording) client.cancelRequests() }
                }
                try { AppReports.upload(applicationContext, client, allowed) }
                finally { captureWatcher.cancel(); client.cancelRequests() }
            }
            Result.success()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: CloudException) {
            if (failure.status == 408 || failure.status == 429 || failure.status >= 500) Result.retry() else Result.failure()
        } catch (_: AuthSessionException) {
            Result.failure() // Keep the file; a lost session requires attention.
        } catch (_: Exception) {
            // Offline failures and capture pauses remain retryable with bounded backoff.
            Result.retry()
        }
    }
}
