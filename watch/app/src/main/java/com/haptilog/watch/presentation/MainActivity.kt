package com.haptilog.watch.presentation

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.haptilog.watch.data.RecordingExport
import com.haptilog.watch.sync.CloudClient
import com.haptilog.watch.sync.RecordingSyncWorker
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.CardDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import com.haptilog.watch.data.RecordingItem
import com.haptilog.watch.data.RecordingRepository
import com.haptilog.watch.presentation.audio.WatchAudioPlayer
import com.haptilog.watch.service.VoiceRecordingService
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_TOGGLE = "toggle_recording"
    }

    private var pendingExportId: String? = null
    private val exportLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        val id = pendingExportId
        pendingExportId = null
        if (uri != null && id != null) lifecycleScope.launch {
            val success = withContext(Dispatchers.IO) {
                runCatching {
                    contentResolver.openOutputStream(uri)?.use { RecordingExport.write(this@MainActivity, id, it) }
                        ?: error("No export destination")
                }.isSuccess
            }
            Toast.makeText(this@MainActivity, if (success) "Recording exported" else "Export failed; recording kept", Toast.LENGTH_LONG).show()
        }
    }
    private fun exportRecording(item: RecordingItem) {
        pendingExportId = item.id
        try { exportLauncher.launch("haptilog-${item.id}.zip") }
        catch (_: ActivityNotFoundException) {
            pendingExportId = null
            Toast.makeText(this, "No export app available on this watch", Toast.LENGTH_LONG).show()
        }
    }
    private var pendingToggle = false
    private lateinit var repository: RecordingRepository
    private lateinit var audioPlayer: WatchAudioPlayer

    @SuppressLint("InvalidFragmentVersionForActivityResult")
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (pendingToggle && permissions[Manifest.permission.RECORD_AUDIO] == true) {
            sendToggle()
        } else if (pendingToggle) {
            Toast.makeText(this, "Microphone permission is needed to record", Toast.LENGTH_LONG).show()
        }
        pendingToggle = false
    }

    private fun sendToggle() {
        val serviceIntent = Intent(this, VoiceRecordingService::class.java).apply {
            action = VoiceRecordingService.ACTION_TOGGLE
        }
        if (VoiceRecordingService.isRecording.value) startService(serviceIntent)
        else ContextCompat.startForegroundService(this, serviceIntent)
    }

    private fun toggleRecording() {
        if (VoiceRecordingService.isRecording.value ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            sendToggle()
        } else {
            pendingToggle = true
            val permissions = mutableListOf(
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(EXTRA_TOGGLE, false)) {
            intent.removeExtra(EXTRA_TOGGLE)
            toggleRecording()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pending_export", pendingExportId)
        outState.putBoolean("pending_toggle", pendingToggle)
        super.onSaveInstanceState(outState)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingExportId = savedInstanceState?.getString("pending_export")
        repository = RecordingRepository(this)
        audioPlayer = WatchAudioPlayer(this)

        pendingToggle = savedInstanceState?.getBoolean("pending_toggle") ?: false
        if (savedInstanceState == null && intent.getBooleanExtra(EXTRA_TOGGLE, false)) {
            intent.removeExtra(EXTRA_TOGGLE)
            toggleRecording()
        }

        setContent {
            MaterialTheme {
                var cloudEnabled by remember { mutableStateOf(RecordingSyncWorker.enabled(this)) }
                val isRecording by VoiceRecordingService.isRecording.collectAsState()
                val elapsedSeconds by VoiceRecordingService.elapsedDurationSeconds.collectAsState()
                val recordings by repository.recordings.collectAsState()
                val playingId by audioPlayer.playingId.collectAsState()
                val isPlaying by audioPlayer.isPlaying.collectAsState()

                // Refresh recordings when recording completes
                LaunchedEffect(isRecording) {
                    while (!isRecording) {
                        repository.refresh()
                        kotlinx.coroutines.delay(5000)
                    }
                }

                DisposableEffect(Unit) {
                    onDispose {
                        audioPlayer.release()
                    }
                }

                HaptiLogScreen(
                    isRecording = isRecording,
                    elapsedSeconds = elapsedSeconds,
                    recordings = recordings,
                    playingId = playingId,
                    isPlaying = isPlaying,
                    onToggleRecording = ::toggleRecording,
                    onTogglePlay = { item -> audioPlayer.togglePlay(item.audioFile, item.id) },
                    onExport = ::exportRecording,
                    onRetry = { item ->
                        RecordingSyncWorker.retry(this, item.id)
                        repository.refresh()
                    },
                    cloudConfigured = CloudClient.configured,
                    cloudEnabled = cloudEnabled,
                    onWebAccess = { if (!isRecording) startActivity(Intent(this, WebAccessActivity::class.java)) },
                    onSync = {
                        if (CloudClient.configured) {
                            if (cloudEnabled) RecordingSyncWorker.disable(this) else RecordingSyncWorker.enable(this)
                            cloudEnabled = !cloudEnabled
                            Toast.makeText(this, if (cloudEnabled) "Cloud sync enabled; local audio is kept" else "Cloud sync paused", Toast.LENGTH_LONG).show()
                        } else Toast.makeText(this, "Cloud sync is not set up yet", Toast.LENGTH_LONG).show()
                    },
                    onDeleteRecording = { id ->
                        if (playingId == id) audioPlayer.stop()
                        repository.deleteRecording(id)
                    }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        repository.refresh()
    }

    override fun onDestroy() {
        super.onDestroy()
        audioPlayer.release()
        repository.close()
    }
}

@Composable
fun HaptiLogScreen(
    isRecording: Boolean,
    elapsedSeconds: Long,
    recordings: List<RecordingItem>,
    playingId: String?,
    isPlaying: Boolean,
    onToggleRecording: () -> Unit,
    onTogglePlay: (RecordingItem) -> Unit,
    onDeleteRecording: (String) -> Unit,
    onExport: (RecordingItem) -> Unit,
    onRetry: (RecordingItem) -> Unit,
    cloudConfigured: Boolean,
    cloudEnabled: Boolean,
    onSync: () -> Unit,
    onWebAccess: () -> Unit
) {
    val listState = rememberScalingLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Scaffold(
        timeText = { TimeText() },
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
    ) {
        ScalingLazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
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
            // 1. Top Spacing
            item {
                Spacer(modifier = Modifier.height(26.dp))
            }

            // 2. Hero Record Action Button
            item {
                RecordHeroSection(
                    isRecording = isRecording,
                    elapsedSeconds = elapsedSeconds,
                    onToggleRecording = onToggleRecording
                )
            }

            // 3. Section Header
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth(0.86f)
                        .padding(horizontal = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "최근 기록",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFF5F5F7)
                    )
                    Text(
                        text = "${recordings.size}",
                        fontSize = 11.sp,
                        color = Color(0xFF8E8E93)
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
            }

            // 4. Recordings List or Empty State
            if (recordings.isEmpty()) {
                item {
                    EmptyRecordingsCard()
                }
            } else {
                items(recordings, key = { it.id }) { item ->
                    RecordingCard(
                        item = item,
                        isPlaying = (playingId == item.id && isPlaying),
                        onTogglePlay = { onTogglePlay(item) },
                        onDelete = { onDeleteRecording(item.id) },
                        onExport = { onExport(item) },
                        onRetry = { onRetry(item) }
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                }
            }

            // 5. Cloud Sync Footer (Subtle & Quiet)
            item {
                Spacer(modifier = Modifier.height(10.dp))
                CompactChip(
                    onClick = onSync,
                    label = {
                        Text(
                            text = if (!cloudConfigured) "로컬 전용 보관" else if (cloudEnabled) "클라우드 동기화 켜짐" else "클라우드 동기화 일시정지",
                            fontSize = 10.sp,
                            color = Color(0xFF8E8E93)
                        )
                    },
                    colors = ChipDefaults.chipColors(
                        backgroundColor = Color(0xFF161618),
                        contentColor = Color(0xFF8E8E93)
                    ),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            item {
                CompactChip(
                    enabled = cloudConfigured && !isRecording,
                    onClick = onWebAccess,
                    label = { Text("Web access", fontSize = 12.sp) }
                )
            }

            // 6. Bottom Safe Area Spacing
            item {
                Spacer(modifier = Modifier.height(36.dp))
            }
        }
    }
}

@Composable
fun RecordHeroSection(
    isRecording: Boolean,
    elapsedSeconds: Long,
    onToggleRecording: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "breathe")
    val breatheAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.95f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "edge_breathe"
    )

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.size(126.dp)
    ) {
        // Subtle 1px Edge Luminance breathing when recording
        if (isRecording) {
            Box(
                modifier = Modifier
                    .size(126.dp)
                    .border(
                        width = 1.dp,
                        color = Color(0xFFFF3B30).copy(alpha = breatheAlpha),
                        shape = CircleShape
                    )
            )
        }

        // Main Monolithic Action Disc
        Button(
            onClick = onToggleRecording,
            modifier = Modifier
                .size(108.dp)
                .border(
                    width = 1.dp,
                    color = if (isRecording) Color(0xFFFF3B30).copy(alpha = 0.5f) else Color(0xFF2C2C2E),
                    shape = CircleShape
                ),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                backgroundColor = if (isRecording) Color(0xFF241012) else Color(0xFF161618)
            )
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                if (isRecording) {
                    val mm = elapsedSeconds / 60
                    val ss = elapsedSeconds % 60
                    Text(
                        text = String.format(Locale.US, "%02d:%02d", mm, ss),
                        fontSize = 19.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFFFF5F5),
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(5.dp)
                                .background(Color(0xFFFF3B30).copy(alpha = breatheAlpha), CircleShape)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "REC",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFFF453A),
                            letterSpacing = 1.2.sp
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(Color(0xFFFF3B30), CircleShape)
                    )
                    Spacer(modifier = Modifier.height(7.dp))
                    Text(
                        text = "RECORD",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.4.sp,
                        color = Color(0xFFF5F5F7)
                    )
                }
            }
        }
    }
}

@Composable
fun EmptyRecordingsCard() {
    Box(
        modifier = Modifier
            .fillMaxWidth(0.85f)
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "기록 없음",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFF8E8E93)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "손목을 탭하여 첫 메모를 남겨보세요",
                fontSize = 10.sp,
                color = Color(0xFF636366),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun RecordingCard(
    item: RecordingItem,
    isPlaying: Boolean,
    onTogglePlay: () -> Unit,
    onDelete: () -> Unit,
    onExport: () -> Unit,
    onRetry: () -> Unit
) {
    val timeFormatted = remember(item.startedAtTimestamp) {
        val diffMs = System.currentTimeMillis() - item.startedAtTimestamp
        when {
            diffMs < 60_000L -> "방금 전"
            diffMs < 3600_000L -> "${diffMs / 60_000L}분 전"
            else -> SimpleDateFormat("M/d HH:mm", Locale.getDefault()).format(Date(item.startedAtTimestamp))
        }
    }

    val cardBg = if (isPlaying) Color(0xFF221717) else Color(0xFF141416)
    val borderColor = if (isPlaying) Color(0xFF4A2525) else Color(0xFF242426)

    Card(
        onClick = onTogglePlay,
        modifier = Modifier
            .fillMaxWidth(0.92f)
            .padding(vertical = 2.dp)
            .border(0.5.dp, borderColor, RoundedCornerShape(16.dp)),
        backgroundPainter = CardDefaults.cardBackgroundPainter(
            startBackgroundColor = cardBg,
            endBackgroundColor = cardBg
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp)
        ) {
            // Header: Time & Duration
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = timeFormatted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFFF5F5F7)
                )
                Text(
                    text = "${item.durationSeconds}s",
                    fontSize = 11.sp,
                    color = Color(0xFF8E8E93)
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Category & Location (Clean Dot & Typography)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start
            ) {
                val (categoryName, dotColor) = when (item.intentType) {
                    "EXPENSE" -> "지출" to Color(0xFF34C759)
                    "TRAVEL" -> "여행" to Color(0xFF0A84FF)
                    "WORKOUT" -> "운동" to Color(0xFFFF9F0A)
                    "MEMO" -> "메모" to Color(0xFFBF5AF2)
                    else -> "대기" to Color(0xFF8E8E93)
                }

                Box(
                    modifier = Modifier
                        .size(5.dp)
                        .background(dotColor, CircleShape)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = categoryName,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFFD1D1D6)
                )

                if (item.latitude != null && item.longitude != null) {
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "·",
                        fontSize = 10.sp,
                        color = Color(0xFF636366)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = String.format(Locale.US, "%.2f°, %.2f°", item.latitude, item.longitude),
                        fontSize = 10.sp,
                        color = Color(0xFF8E8E93)
                    )
                }
            }

            // Summary text if present
            if (!item.summary.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = item.summary,
                    fontSize = 11.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = Color(0xFFE5E5EA),
                    lineHeight = 14.sp
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Actions row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Play / Stop button
                CompactChip(
                    onClick = onTogglePlay,
                    label = {
                        Text(
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

                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (item.syncStatus == "ACTION_REQUIRED") {
                        CompactChip(
                            onClick = onRetry,
                            label = { Text("재시도", fontSize = 10.sp) },
                            colors = ChipDefaults.chipColors(
                                backgroundColor = Color(0xFF2C2C2E),
                                contentColor = Color(0xFFFF9F0A)
                            ),
                            shape = RoundedCornerShape(10.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                    }

                    CompactChip(
                        onClick = onExport,
                        label = { Text("내보내기", fontSize = 10.sp) },
                        colors = ChipDefaults.chipColors(
                            backgroundColor = Color(0xFF242426),
                            contentColor = Color(0xFF8E8E93)
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )

                    Spacer(modifier = Modifier.width(4.dp))

                    CompactChip(
                        onClick = onDelete,
                        label = { Text("삭제", fontSize = 10.sp) },
                        colors = ChipDefaults.chipColors(
                            backgroundColor = Color(0xFF241C1C),
                            contentColor = Color(0xFFFF6961)
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            }
        }
    }
}
