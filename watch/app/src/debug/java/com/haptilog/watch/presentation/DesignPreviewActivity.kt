package com.haptilog.watch.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.AppScaffold
import com.haptilog.watch.data.RecordingItem
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant

/** Debug-only visual fixture host. It never calls capture, sync, deletion or audio playback. */
class DesignPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val audio = File(cacheDir, "design-preview.wav")
        // A valid one-second silent WAV in cache, separate from all source recordings.
        if (!audio.exists()) {
            val data = ByteArray(32_000)
            val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
                .put("RIFF".toByteArray()).putInt(36 + data.size).put("WAVEfmt ".toByteArray())
                .putInt(16).putShort(1).putShort(1).putInt(16_000).putInt(32_000)
                .putShort(2).putShort(16).put("data".toByteArray()).putInt(data.size).array()
            audio.writeBytes(header + data)
        }
        fun fixture(type: String, title: String, seconds: Int, time: String, details: JSONObject) = RecordingItem(
            id = "preview-$type", audioFile = audio, metaFile = File(cacheDir, "preview-meta.json"),
            startedAtIso = time, startedAtTimestamp = Instant.parse(time).toEpochMilli(),
            durationSeconds = seconds, status = "COMPLETED", syncStatus = "SYNCED", uploaded = true,
            intentType = type, summary = title, transcript = "시안 대조용 예시 전문입니다. 실제 녹음이 아닙니다.",
            structuredData = details)
        val travel = fixture("TRAVEL", "기차표 예약", 83, "2026-10-24T14:02:00Z", JSONObject().put("notes", "금요일 오후 기차표 예약"))
        val workout = fixture("WORKOUT", "아침 러닝", 42, "2026-10-24T09:15:00Z", JSONObject())
        val expense = fixture("EXPENSE", "점심 식사", 35, "2026-10-24T13:00:00Z",
            JSONObject().put("amount", 12000).put("currency", "KRW").put("category", "식비"))
        val note = fixture("MEMO", "회의 아이디어", 58, "2026-10-23T15:00:00Z", JSONObject())
        val initialScreen = intent.getStringExtra("screen") ?: "home"
        setContent {
            HaptiLogTheme {
                AppScaffold {
                    var screen by rememberSaveable { mutableStateOf(initialScreen) }
                    var playing by remember { mutableStateOf(false) }
                    var selected by remember { mutableStateOf<RecordingItem?>(null) }
                    val list = rememberTransformingLazyColumnState()
                    BackHandler(screen != "home") { selected = null; playing = false; screen = "home" }
                    val detail = selected ?: when (screen) { "travel" -> travel; "expense" -> expense; else -> null }
                    when {
                        detail != null -> RecordingDetailScreen(detail, playing, true, null,
                            onTogglePlay = { playing = !playing }, onExport = {}, onRetry = {}, onOpenMap = {}, onDelete = {})
                        screen == "list" || screen == "list-secondary" -> RecordingsScreen(
                            if (screen == "list") listOf(travel, workout) else listOf(expense, note), list, true, null,
                            onOpenRecording = { selected = it })
                        else -> CaptureScreen(screen == "recording", 83,
                            onToggleRecording = { screen = if (screen == "recording") "home" else "recording" },
                            onRecordings = { screen = "list" }, onSettings = {})
                    }
                }
            }
        }
    }
}
