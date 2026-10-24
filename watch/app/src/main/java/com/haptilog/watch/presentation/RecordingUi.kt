package com.haptilog.watch.presentation

import android.content.Context
import android.text.format.DateFormat
import com.haptilog.watch.R
import com.haptilog.watch.data.RecordingItem
import java.util.Date

fun recordingDate(context: Context, item: RecordingItem): String =
    DateFormat.getMediumDateFormat(context).format(Date(item.startedAtTimestamp)) + " " +
        DateFormat.getTimeFormat(context).format(Date(item.startedAtTimestamp))

fun recordingTitle(context: Context, item: RecordingItem): String = item.summary?.trim()
    ?.takeIf { it.isNotBlank() }
    ?: context.getString(R.string.recording_named_at, recordingDate(context, item))

fun categoryLabel(context: Context, intent: String?): String = context.getString(when (intent) {
    "EXPENSE" -> R.string.category_expense
    "TRAVEL" -> R.string.category_travel
    "WORKOUT" -> R.string.category_workout
    "MEMO" -> R.string.category_memo
    else -> R.string.category_pending
})

fun recordingSyncLabel(context: Context, item: RecordingItem, cloudEnabled: Boolean): String {
    if (!cloudEnabled && item.syncStatus in setOf("PENDING_SYNC", "SYNCING")) return context.getString(R.string.local_only)
    return context.getString(when (item.syncStatus) {
        "SYNCED" -> R.string.sync_synced
        "SYNCING" -> R.string.sync_syncing
        "PENDING_SYNC" -> if (item.uploaded) R.string.sync_analysis_pending else R.string.sync_upload_pending
        "ACTION_REQUIRED" -> R.string.sync_attention
        "CAPTURE_FAILED" -> R.string.sync_capture_failed
        "RECOVERY_REQUIRED" -> R.string.sync_recovery
        else -> R.string.sync_waiting
    })
}

/** A failed unlink can already have removed audio. Never promise rollback or cloud deletion. */
fun localDeleteFailure(context: Context, item: RecordingItem): String = context.getString(when {
    !item.audioFile.exists() && item.metaFile.exists() -> R.string.delete_audio_missing
    !item.audioFile.exists() && !item.metaFile.exists() -> R.string.delete_cleanup_failed
    else -> R.string.delete_failed
})

/** Locale-aware short date and clock preference, with each date/time token kept intact. */
fun compactRecordingDate(context: Context, item: RecordingItem): String {
    val locale = context.resources.configuration.locales[0]
    val date = Date(item.startedAtTimestamp)
    val dayPattern = DateFormat.getBestDateTimePattern(locale, "Md")
    val timePattern = DateFormat.getBestDateTimePattern(locale,
        if (DateFormat.is24HourFormat(context)) "HHmm" else "hmm")
    val day = java.text.SimpleDateFormat(dayPattern, locale).format(date).replace(' ', '\u00A0')
    val time = java.text.SimpleDateFormat(timePattern, locale).format(date).replace(' ', '\u00A0')
    // Permit a large-font line break between the day and clock, but not inside either token.
    return "$day $time"
}

fun recordingDuration(context: Context, seconds: Long): String {
    val safe = seconds.coerceAtLeast(0)
    val minutes = safe / 60
    val remainder = safe % 60
    return when {
        minutes == 0L -> context.getString(R.string.duration_seconds, remainder)
        remainder == 0L -> context.getString(R.string.duration_minutes, minutes)
        else -> context.getString(R.string.duration_minutes_seconds, minutes, remainder)
    }.replace(' ', '\u00A0')
}
