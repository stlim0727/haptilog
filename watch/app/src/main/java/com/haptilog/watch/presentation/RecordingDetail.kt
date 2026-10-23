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
fun structuredDataLines(intentType: String?, data: JSONObject?): List<String> {
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
            is String -> if (value.isNotBlank()) lines += "${structuredKeyLabels[key] ?: key}: $value"
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
    onTogglePlay: () -> Unit,
    onExport: () -> Unit,
    onRetry: () -> Unit,
    onDelete: () -> Unit
) {
    val context = LocalContext.current
    val listState = rememberScalingLazyListState(initialCenterItemIndex = 0)
    val coroutineScope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    val startedAt = remember(item.startedAtTimestamp) {
        SimpleDateFormat("M/d HH:mm", Locale.getDefault()).format(Date(item.startedAtTimestamp))
    }
    val summary = item.summary?.takeIf { it.isNotBlank() }
    val transcript = item.transcript?.takeIf { it.isNotBlank() }
    val structuredLines = structuredDataLines(item.intentType, item.structuredData)
    val (categoryName, dotColor) = recordingCategory(item.intentType)

    Scaffold(
        timeText = { if (!listState.canScrollBackward && !listState.isScrollInProgress) TimeText() },
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
    ) {
        ScalingLazyColumn(
            state = listState,
            autoCentering = null,
            contentPadding = PaddingValues(top = 36.dp, bottom = 56.dp),
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .padding(horizontal = 18.dp)
                .focusRequester(focusRequester)
                .focusable()
                .onRotaryScrollEvent { event ->
                    coroutineScope.launch {
                        listState.scrollBy(event.verticalScrollPixels)
                    }
                    true
                },
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = startedAt, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFF5F5F7))
                    Text(text = "${item.durationSeconds}s", fontSize = 11.sp, color = Color(0xFF8E8E93))
                }
            }

            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth(0.9f)
                ) {
                    Box(modifier = Modifier.size(5.dp).background(dotColor, CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = categoryName, fontSize = 10.sp, fontWeight = FontWeight.Medium, color = Color(0xFFD1D1D6))
                }
            }

            if (summary != null) item {
                Column(modifier = Modifier.fillMaxWidth(0.86f)) {
                    DetailSection(label = "요약")
                    Text(
                        text = summary,
                        fontSize = 11.sp,
                        color = Color(0xFFE5E5EA),
                        lineHeight = 14.sp
                    )
                }
            }

            if (transcript != null) item {
                Column(modifier = Modifier.fillMaxWidth(0.86f)) {
                    DetailSection(label = "전사")
                    Text(
                        text = transcript,
                        fontSize = 11.sp,
                        color = Color(0xFFE5E5EA),
                        lineHeight = 14.sp
                    )
                }
            }

            if (summary == null && transcript == null) item {
                Text(
                    text = "아직 해석된 내용이 없습니다",
                    fontSize = 11.sp,
                    color = Color(0xFF8E8E93),
                    modifier = Modifier.fillMaxWidth(0.86f)
                )
            }

            if (structuredLines.isNotEmpty()) item {
                Column(modifier = Modifier.fillMaxWidth(0.86f)) {
                    DetailSection(label = "세부 내용")
                    structuredLines.forEach { line ->
                        Text(text = line, fontSize = 11.sp, color = Color(0xFFE5E5EA), lineHeight = 14.sp)
                    }
                }
            }

            if (hasMapLocation(item)) item {
                FlexibleChip(
                    onClick = {
                        val latitude = item.latitude
                        val longitude = item.longitude
                        try {
                            context.startActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude")
                                )
                            )
                        } catch (_: ActivityNotFoundException) {
                            Toast.makeText(context, "지도를 열 수 있는 앱이 없습니다", Toast.LENGTH_LONG).show()
                        }
                    },
                    label = { Text(maxLines = Int.MAX_VALUE, text = "지도 보기") },
                    modifier = Modifier.fillMaxWidth(0.86f)
                )
            }

            item {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth(0.86f)
                ) {
                    DetailSection(label = "동기화")
                    Text(
                        text = syncStatusLabel(item),
                        fontSize = 11.sp,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        color = Color(0xFF8E8E93)
                    )
                }
            }

            if (item.syncStatus == "ACTION_REQUIRED") item {
                FlexibleChip(
                    onClick = onRetry,
                    label = { Text(maxLines = Int.MAX_VALUE, text = "재시도", fontSize = 10.sp) },
                    colors = ChipDefaults.chipColors(
                        backgroundColor = Color(0xFF2C2C2E),
                        contentColor = Color(0xFFFF9F0A)
                    ),
                    shape = RoundedCornerShape(10.dp)
                )
            }

            item {
                FlexibleChip(
                    onClick = onTogglePlay,
                    label = {
                        Text(maxLines = Int.MAX_VALUE,
                            text = if (isPlaying) "정지" else "재생",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium
                        )
                    },
                    colors = ChipDefaults.chipColors(
                        backgroundColor = if (isPlaying) Color(0xFF442022) else Color(0xFF2C2C2E),
                        contentColor = if (isPlaying) Color(0xFFFF453A) else Color(0xFFF5F5F7)
                    ),
                    shape = RoundedCornerShape(10.dp)
                )
            }

            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    FlexibleChip(
                        onClick = onExport,
                        label = { Text(maxLines = Int.MAX_VALUE, text = "내보내기", fontSize = 10.sp) },
                        colors = ChipDefaults.chipColors(
                            backgroundColor = Color(0xFF242426),
                            contentColor = Color(0xFF8E8E93)
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )
                    FlexibleChip(
                        onClick = onDelete,
                        label = { Text(maxLines = Int.MAX_VALUE, text = "삭제", fontSize = 10.sp) },
                        colors = ChipDefaults.chipColors(
                            backgroundColor = Color(0xFF241C1C),
                            contentColor = Color(0xFFFF6961)
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(36.dp)) }
        }
    }
}

@Composable
private fun DetailSection(label: String) {
    Text(
        text = label,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFF8E8E93),
        modifier = Modifier
            .fillMaxWidth(0.86f)
            .padding(bottom = 2.dp)
    )
}
