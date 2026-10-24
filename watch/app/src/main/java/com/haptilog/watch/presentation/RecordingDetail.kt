package com.haptilog.watch.presentation

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import com.haptilog.watch.R
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import com.haptilog.watch.data.RecordingItem
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Category label and dot colour, shared by the list card and the detail screen. */
fun recordingCategory(intentType: String?): Pair<String, Color> = when (intentType) {
    "EXPENSE" -> "지출" to Color(0xFF34C759)
    "TRAVEL" -> "여행" to Color(0xFF0A84FF)
    "WORKOUT" -> "운동" to Color(0xFFFF9F0A)
    "MEMO" -> "메모" to Color(0xFFBF5AF2)
    else -> "대기" to Color(0xFF8E8E93)
}

fun hasMapLocation(item: RecordingItem): Boolean {
    val latitude = item.latitude
    val longitude = item.longitude
    return latitude != null && latitude.isFinite() && latitude in -90.0..90.0 &&
        longitude != null && longitude.isFinite() && longitude in -180.0..180.0
}

private val structuredKeyLabels = mapOf(
    "merchant" to "상인",
    "category" to "카테고리",
    "notes" to "메모",
)

/**
 * Compact wrist rendering of the AI `structured_data` object: amounts and action items first,
 * then remaining scalar fields. Keys are English by model contract, values follow the recording
 * language, so unknown keys are shown as-is rather than dropped.
 */
fun structuredDataLines(intentType: String?, data: JSONObject?, keyLabels: Map<String, String> = structuredKeyLabels): List<String> {
    if (data == null) return emptyList()
    val lines = mutableListOf<String>()
    val consumed = mutableSetOf<String>()

    if (intentType == "EXPENSE") {
        val amount = data.opt("amount")
        if (amount is Number && amount.toDouble() >= 0) {
            consumed += "amount"
            val formatted = String.format(Locale.US, "%,.0f", amount.toDouble())
            val currency = data.optString("currency").takeIf { it.matches(Regex("^[A-Z]{3}$")) }
            currency?.let { consumed += "currency" }
            lines += if (currency != null) "$formatted $currency" else formatted
        }
    }
    if (intentType == "MEMO") {
        consumed += "action_items"
        val actionItems = data.opt("action_items")
        if (actionItems is JSONArray) {
            for (index in 0 until actionItems.length()) {
                val entry = actionItems.opt(index)
                if (entry is String && entry.isNotBlank()) lines += "· $entry"
            }
        }
    }

    for (key in data.keys().asSequence().filterNot { it in consumed }) {
        when (val value = data.opt(key)) {
            is String -> if (value.isNotBlank()) lines += "${keyLabels[key] ?: key}: $value"
            is Number, is Boolean -> lines += "$key: $value"
            else -> Unit
        }
    }
    return lines.take(6)
}

fun syncStatusLabel(item: RecordingItem): String {
    val status = when (item.syncStatus) {
        "SYNCED" -> "동기화됨"
        "SYNCING" -> "동기화 중"
        "PENDING_SYNC" -> if (item.uploaded) "해석 대기" else "동기화 대기"
        "ACTION_REQUIRED" -> "확인 필요"
        "CAPTURE_FAILED" -> "녹음 실패"
        "RECOVERY_REQUIRED" -> "복구 필요"
        else -> "대기"
    }
    val parts = mutableListOf(status)
    if (item.syncAttempts > 0) parts += "시도 ${item.syncAttempts}회"
    item.syncError?.let { parts += it }
    return parts.joinToString(" · ")
}

@Composable
fun RecordingDetailScreen(
    item: RecordingItem,
    isPlaying: Boolean,
    cloudEnabled: Boolean,
    notice: String?,
    onTogglePlay: () -> Unit,
    onExport: () -> Unit,
    onRetry: () -> Unit,
    onOpenMap: () -> Unit,
    onDelete: () -> Unit
) {
    val context = LocalContext.current
    val listState = rememberScalingLazyListState(initialCenterItemIndex = 0)
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    var confirmingDelete by rememberSaveable(item.id) { mutableStateOf(false) }
    var transcriptExpanded by rememberSaveable(item.id) { mutableStateOf(false) }
    var syncExpanded by rememberSaveable(item.id) { mutableStateOf(false) }
    BackHandler(enabled = confirmingDelete) { confirmingDelete = false }
    LaunchedEffect(Unit) { focus.requestFocus() }
    LaunchedEffect(confirmingDelete) { if (confirmingDelete) listState.scrollToItem(0) }
    val fullText = item.transcript?.takeIf { it.isNotBlank() }
    val summary = item.summary?.takeIf { it.isNotBlank() }
    val structured = structuredDataLines(item.intentType, item.structuredData, mapOf(
        "merchant" to stringResource(R.string.merchant_label),
        "category" to stringResource(R.string.category_label),
        "notes" to stringResource(R.string.notes_label)))
    val audioAvailable = item.audioFile.isFile && item.audioFile.length() > 0

    Scaffold(
        timeText = { if (!listState.canScrollBackward && !listState.isScrollInProgress) TimeText() },
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
    ) {
        ScalingLazyColumn(
            state = listState,
            autoCentering = null,
            contentPadding = PaddingValues(top = 36.dp, bottom = 56.dp),
            modifier = Modifier.fillMaxSize().background(Color.Black).padding(horizontal = 16.dp)
                .focusRequester(focus).focusable().onRotaryScrollEvent { event ->
                    scope.launch { listState.scrollBy(event.verticalScrollPixels) }; true
                },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (confirmingDelete) {
                item { Text(stringResource(R.string.delete_confirm_title), fontSize = 18.sp,
                    modifier = Modifier.fillMaxWidth(0.9f)) }
                item { Text(stringResource(if (item.uploaded || cloudEnabled) R.string.delete_confirm_scope else R.string.delete_confirm_scope_local_only), fontSize = 14.sp,
                    color = WatchColors.Muted, modifier = Modifier.fillMaxWidth(0.9f)) }
                item { FlexibleChip(onClick = { confirmingDelete = false },
                    label = { Text(stringResource(R.string.cancel_action), maxLines = Int.MAX_VALUE) }) }
                item { FlexibleChip(onClick = { confirmingDelete = false; onDelete() },
                    label = { Text(stringResource(R.string.delete_action), maxLines = Int.MAX_VALUE) },
                    colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF392521), contentColor = WatchColors.Error)) }
            } else {
                item {
                    Column(Modifier.fillMaxWidth(0.9f)) {
                        Text(recordingDate(context, item), fontSize = 14.sp, color = WatchColors.Muted)
                        Text(stringResource(R.string.duration_seconds, item.durationSeconds), fontSize = 12.sp, color = WatchColors.Muted)
                    }
                }
                item {
                    FlexibleChip(
                        enabled = audioAvailable,
                        onClick = onTogglePlay,
                        label = { Text(stringResource(if (isPlaying) R.string.stop_playback else R.string.play_audio),
                            maxLines = Int.MAX_VALUE, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) },
                        colors = ChipDefaults.chipColors(backgroundColor = Color(0xFFDFE8D9), contentColor = Color(0xFF172819)),
                        secondaryLabel = { Text(stringResource(R.string.duration_seconds, item.durationSeconds), maxLines = Int.MAX_VALUE) }
                    )
                }
                if (!audioAvailable) item { Text(stringResource(R.string.audio_missing), color = WatchColors.Error, fontSize = 14.sp) }
                notice?.let { message -> item { Text(message, fontSize = 14.sp, color = WatchColors.Error) } }
                item { Text(categoryLabel(context, item.intentType), fontSize = 12.sp, color = WatchColors.Muted) }
                if (summary != null) item {
                    Column(Modifier.fillMaxWidth(0.9f)) {
                        DetailSection(stringResource(R.string.ai_summary))
                        Text(summary, fontSize = 14.sp, color = WatchColors.Text)
                    }
                }
                if (fullText != null) {
                    item {
                        val expandedState = stringResource(if (transcriptExpanded) R.string.expanded else R.string.collapsed)
                        FlexibleChip(onClick = { transcriptExpanded = !transcriptExpanded },
                            modifier = Modifier.semantics { stateDescription = expandedState },
                            label = { Text(stringResource(if (transcriptExpanded) R.string.hide_transcript else R.string.show_transcript), maxLines = Int.MAX_VALUE) })
                    }
                    if (transcriptExpanded) item {
                        Column(Modifier.fillMaxWidth(0.9f)) {
                            DetailSection(stringResource(R.string.transcript_title))
                            Text(fullText, fontSize = 14.sp, color = WatchColors.Text)
                        }
                    }
                }
                if (summary == null && fullText == null) item {
                    Text(stringResource(R.string.no_enrichment), fontSize = 14.sp, color = WatchColors.Muted,
                        modifier = Modifier.fillMaxWidth(0.9f))
                }
                if (structured.isNotEmpty()) item {
                    Column(Modifier.fillMaxWidth(0.9f)) {
                        DetailSection(stringResource(R.string.structured_details))
                        structured.forEach { Text(it, fontSize = 14.sp, color = WatchColors.Text) }
                    }
                }
                if (hasMapLocation(item)) item {
                    FlexibleChip(onClick = onOpenMap,
                        label = { Text(stringResource(R.string.map_action), maxLines = Int.MAX_VALUE) })
                }
                item { Text(recordingSyncLabel(context, item, cloudEnabled), fontSize = 12.sp, color = WatchColors.Muted) }
                if (item.syncStatus == "ACTION_REQUIRED") item {
                    FlexibleChip(enabled = cloudEnabled, onClick = onRetry,
                        label = { Text(stringResource(R.string.retry_action), maxLines = Int.MAX_VALUE) })
                }
                if (item.syncAttempts > 0 || !item.syncError.isNullOrBlank()) {
                    item {
                        val expandedState = stringResource(if (syncExpanded) R.string.expanded else R.string.collapsed)
                        FlexibleChip(onClick = { syncExpanded = !syncExpanded }, modifier = Modifier.semantics { stateDescription = expandedState },
                            label = { Text(stringResource(R.string.sync_details), maxLines = Int.MAX_VALUE) })
                    }
                    if (syncExpanded) item {
                        Text(stringResource(R.string.sync_attempts, recordingSyncLabel(context, item, cloudEnabled), item.syncAttempts) +
                            (item.syncError?.let { "\n$it" } ?: ""), fontSize = 12.sp, color = WatchColors.Muted)
                    }
                }
                item { FlexibleChip(onClick = onExport, label = { Text(stringResource(R.string.export_action), maxLines = Int.MAX_VALUE) }) }
                item { FlexibleChip(onClick = { confirmingDelete = true },
                    label = { Text(stringResource(if (item.uploaded || cloudEnabled) R.string.delete_recording else R.string.delete_local), maxLines = Int.MAX_VALUE) },
                    colors = ChipDefaults.chipColors(backgroundColor = WatchColors.Surface, contentColor = WatchColors.Error)) }
            }
        }
    }
}

@Composable
private fun DetailSection(label: String) {
    Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = WatchColors.Muted,
        modifier = Modifier.padding(bottom = 4.dp))
}
