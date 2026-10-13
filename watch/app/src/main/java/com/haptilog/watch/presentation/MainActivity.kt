package com.haptilog.watch.presentation

import android.Manifest
import android.annotation.SuppressLint
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

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("pending_toggle", pendingToggle)
        super.onSaveInstanceState(outState)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = RecordingRepository(this)
        audioPlayer = WatchAudioPlayer(this)

        pendingToggle = savedInstanceState?.getBoolean("pending_toggle") ?: false
        if (savedInstanceState == null && intent.getBooleanExtra(EXTRA_TOGGLE, false)) {
            intent.removeExtra(EXTRA_TOGGLE)
            toggleRecording()
        }

        setContent {
            MaterialTheme {
                val isRecording by VoiceRecordingService.isRecording.collectAsState()
                val elapsedSeconds by VoiceRecordingService.elapsedDurationSeconds.collectAsState()
                val recordings by repository.recordings.collectAsState()
                val playingId by audioPlayer.playingId.collectAsState()
                val isPlaying by audioPlayer.isPlaying.collectAsState()

                // Refresh recordings when recording completes
                LaunchedEffect(isRecording) {
                    if (!isRecording) {
                        repository.refresh()
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
    onDeleteRecording: (String) -> Unit
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
                Spacer(modifier = Modifier.height(28.dp))
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
                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth(0.85f)
                        .padding(horizontal = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "최근 기록",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFEEEEEE)
                    )
                    Text(
                        text = "${recordings.size}건",
                        fontSize = 11.sp,
                        color = Color(0xFF9E9E9E)
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
                        onDelete = { onDeleteRecording(item.id) }
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                }
            }

            // 5. Bottom Safe Area Spacing
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
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.16f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.size(130.dp)
    ) {
        // Outer pulsing ring when recording
        if (isRecording) {
            Box(
                modifier = Modifier
                    .size(130.dp)
                    .scale(pulseScale)
                    .background(Color(0xFFE53935).copy(alpha = 0.35f), CircleShape)
            )
        }

        // Main Action Circular Button
        Button(
            onClick = onToggleRecording,
            modifier = Modifier.size(105.dp),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                backgroundColor = if (isRecording) Color(0xFFD32F2F) else Color(0xFF1976D2)
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
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "STOP",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFFFCDD2)
                    )
                } else {
                    Text(
                        text = "🎙️",
                        fontSize = 22.sp
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "RECORD",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

@Composable
fun EmptyRecordingsCard() {
    Card(
        onClick = {},
        modifier = Modifier
            .fillMaxWidth(0.9f)
            .padding(vertical = 4.dp),
        backgroundPainter = CardDefaults.cardBackgroundPainter(
            startBackgroundColor = Color(0xFF1E1E1E),
            endBackgroundColor = Color(0xFF1E1E1E)
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "아직 기록이 없습니다",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "위 버튼을 탭하여 첫 음성 메모를 남겨보세요.",
                fontSize = 10.sp,
                color = Color(0xFFAAAAAA),
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
    onDelete: () -> Unit
) {
    val timeFormatted = remember(item.startedAtTimestamp) {
        val diffMs = System.currentTimeMillis() - item.startedAtTimestamp
        when {
            diffMs < 60_000L -> "방금 전"
            diffMs < 3600_000L -> "${diffMs / 60_000L}분 전"
            else -> SimpleDateFormat("M/d HH:mm", Locale.getDefault()).format(Date(item.startedAtTimestamp))
        }
    }

    val cardBg = if (isPlaying) Color(0xFF2E2424) else Color(0xFF1C1C1E)

    Card(
        onClick = onTogglePlay,
        modifier = Modifier
            .fillMaxWidth(0.92f)
            .padding(vertical = 2.dp),
        backgroundPainter = CardDefaults.cardBackgroundPainter(
            startBackgroundColor = cardBg,
            endBackgroundColor = cardBg
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp)
        ) {
            // Header: Time + Duration
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = timeFormatted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Text(
                    text = "${item.durationSeconds}초",
                    fontSize = 11.sp,
                    color = Color(0xFFB0BEC5)
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Badges: Category Intent & Location
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start
            ) {
                // Category Chip
                val (badgeText, badgeBg) = when (item.intentType) {
                    "EXPENSE" -> "💰 가계부" to Color(0xFF2E7D32)
                    "TRAVEL" -> "🗺️ 여행" to Color(0xFF0277BD)
                    "WORKOUT" -> "🏃 운동" to Color(0xFFE65100)
                    "MEMO" -> "📝 메모" to Color(0xFF6A1B9A)
                    else -> "⏳ 대기중" to Color(0xFF455A64)
                }

                Box(
                    modifier = Modifier
                        .background(badgeBg.copy(alpha = 0.85f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = badgeText,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color.White
                    )
                }

                // GPS Badge if present
                if (item.latitude != null && item.longitude != null) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF37474F), RoundedCornerShape(8.dp))
                            .padding(horizontal = 5.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = String.format(Locale.US, "📍 %.2f, %.2f", item.latitude, item.longitude),
                            fontSize = 9.sp,
                            color = Color(0xFFCFD8DC)
                        )
                    }
                }
            }

            // Summary or transcript if available
            if (!item.summary.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = item.summary,
                    fontSize = 11.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = Color(0xFFECEFF1)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Action Buttons: Play/Stop & Delete
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Play / Stop Mini Button
                CompactChip(
                    onClick = onTogglePlay,
                    label = {
                        Text(
                            text = if (isPlaying) "⏹️ 정지" else "▶️ 듣기",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    },
                    colors = ChipDefaults.chipColors(
                        backgroundColor = if (isPlaying) Color(0xFFD32F2F) else Color(0xFF1976D2),
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp)
                )

                // Delete Mini Button
                CompactChip(
                    onClick = onDelete,
                    label = {
                        Text(
                            text = "🗑️",
                            fontSize = 11.sp
                        )
                    },
                    colors = ChipDefaults.chipColors(
                        backgroundColor = Color(0xFF2C2C2E),
                        contentColor = Color(0xFFEF5350)
                    ),
                    shape = RoundedCornerShape(12.dp)
                )
            }
        }
    }
}
