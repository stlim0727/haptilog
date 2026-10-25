package com.haptilog.watch.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.haptilog.watch.R
import com.haptilog.watch.presentation.MainActivity

/** Best-effort status delivery must never change capture or sync outcomes. */
object RecordingNotifications {
    const val CHANNEL = "haptilog_recording_events"
    const val EXTRA_RECORDINGS = "notification_recordings"
    private const val EVENT_ID = 2001
    private const val SYNC_ID = 2002

    fun autoStopped(context: Context) = post(context, "capture", EVENT_ID,
        R.string.notification_auto_stop_title, R.string.notification_auto_stop_body)
    fun captureFailed(context: Context) = post(context, "capture", EVENT_ID,
        R.string.notification_capture_failed_title, R.string.notification_capture_failed_body)
    fun syncNeedsAttention(context: Context, id: String) = post(context, id, SYNC_ID,
        R.string.notification_sync_title, R.string.notification_sync_body)

    fun clearSync(context: Context, id: String) {
        runCatching { context.getSystemService(NotificationManager::class.java).cancel(id, SYNC_ID) }
    }

    fun clearAllSync(context: Context) {
        runCatching {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.activeNotifications.filter { it.id == SYNC_ID }.forEach { manager.cancel(it.tag, it.id) }
        }
    }

    private fun post(context: Context, tag: String, id: Int, title: Int, body: Int) {
        runCatching {
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(
                    context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val manager = context.getSystemService(NotificationManager::class.java)
            if (!manager.areNotificationsEnabled()) return
            // Silent by default: preserve the recording haptic vocabulary and microphone audio.
            manager.createNotificationChannel(NotificationChannel(CHANNEL,
                context.getString(R.string.notification_events_channel), NotificationManager.IMPORTANCE_LOW).apply {
                setSound(null, null)
                enableVibration(false)
            })
            val intent = Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_RECORDINGS, true)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            val pending = PendingIntent.getActivity(context, 2001, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            manager.notify(tag, id, NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle(context.getString(title))
                .setContentText(context.getString(body))
                .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(body)))
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setLocalOnly(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .build())
        }
    }
}
