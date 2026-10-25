package com.haptilog.watch.notifications

import android.app.Application
import android.app.NotificationManager
import android.content.Context
import com.haptilog.watch.R
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = Application::class)
class RecordingNotificationsTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()
    private val manager get() = context.getSystemService(NotificationManager::class.java)

    @Test fun autoStopLinksToRecordingsWithoutTogglingCapture() {
        RecordingNotifications.autoStopped(context)
        val notification = manager.activeNotifications.single().notification
        val intent = shadowOf(notification.contentIntent).savedIntent
        assertTrue(intent.getBooleanExtra(RecordingNotifications.EXTRA_RECORDINGS, false))
        assertFalse(intent.getBooleanExtra("toggle_recording", false))
        assertEquals(context.getString(R.string.notification_auto_stop_title),
            notification.extras.getString("android.title"))
        assertEquals(NotificationManager.IMPORTANCE_LOW,
            manager.getNotificationChannel(RecordingNotifications.CHANNEL).importance)
        assertFalse(manager.getNotificationChannel(RecordingNotifications.CHANNEL).shouldVibrate())
    }

    @Test fun repeatedFailureReplacesNotificationAndRetryClearsOnlyThatRecording() {
        RecordingNotifications.syncNeedsAttention(context, "one")
        RecordingNotifications.syncNeedsAttention(context, "one")
        RecordingNotifications.syncNeedsAttention(context, "two")
        assertEquals(2, manager.activeNotifications.size)
        RecordingNotifications.clearSync(context, "one")
        assertEquals("two", manager.activeNotifications.single().tag)
    }

    @Test fun disablingSyncPreservesCaptureNotice() {
        RecordingNotifications.captureFailed(context)
        RecordingNotifications.syncNeedsAttention(context, "one")
        RecordingNotifications.clearAllSync(context)
        assertEquals(1, manager.activeNotifications.size)
        assertEquals(context.getString(R.string.notification_capture_failed_title),
            manager.activeNotifications.single().notification.extras.getString("android.title"))
    }

    @Test fun foregroundNotificationOffersStopWithoutStartingCapture() {
        val service = org.robolectric.Robolectric.buildService(
            com.haptilog.watch.service.VoiceRecordingService::class.java).get()
        val notification = org.robolectric.util.ReflectionHelpers.callInstanceMethod<android.app.Notification>(
            service, "buildForegroundNotification")
        val stop = notification.actions.single()
        assertEquals(context.getString(R.string.notification_stop), stop.title.toString())
        assertEquals(com.haptilog.watch.service.VoiceRecordingService.ACTION_STOP,
            shadowOf(stop.actionIntent).savedIntent.action)
        assertTrue(notification.flags and android.app.Notification.FLAG_ONGOING_EVENT != 0)
    }

    @Test @Config(sdk = [33])
    fun deniedPermissionDoesNotPostOrThrow() {
        shadowOf(RuntimeEnvironment.getApplication())
            .denyPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        RecordingNotifications.captureFailed(context)
        RecordingNotifications.syncNeedsAttention(context, "one")
        assertTrue(manager.activeNotifications.isEmpty())
    }
}
