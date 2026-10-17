package com.haptilog.watch.support

import android.content.Context
import androidx.work.*
import com.haptilog.watch.service.VoiceRecordingService
import com.haptilog.watch.sync.CloudClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class ReportUploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        fun schedule(context: Context) {
            if (!CloudClient.configured || AppReports.pending(context) == 0) return
            WorkManager.getInstance(context).enqueueUniqueWork("support-reports", ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<ReportUploadWorker>()
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)
                        .setRequiresBatteryNotLow(true).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
        }
    }
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (VoiceRecordingService.isRecording.value) return@withContext Result.retry()
        try {
            AppReports.upload(applicationContext, CloudClient(applicationContext))
            Result.success()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}
