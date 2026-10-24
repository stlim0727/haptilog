package com.haptilog.watch.presentation

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.haptilog.watch.data.RecordingExport
import com.haptilog.watch.sync.RecordingSyncWorker
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.lifecycle.ViewModelProvider
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalContext
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.wear.compose.material.Icon
import com.haptilog.watch.R
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.CardDefaults
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
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

    private val entryState by lazy { ViewModelProvider(this)[CaptureEntryState::class.java] }
    private var cloudSyncEnabled by mutableStateOf(false)
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
        entryState.beginInternalReturn()
        try { exportLauncher.launch("haptilog-${item.id}.zip") }
        catch (_: ActivityNotFoundException) {
            entryState.cancelInternalReturn()
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
        entryState.requestCapture()
        if (intent.getBooleanExtra(EXTRA_TOGGLE, false)) {
            intent.removeExtra(EXTRA_TOGGLE)
            toggleRecording()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("internal_return", entryState.internalReturn)
        outState.putString("capture_request", entryState.request)
        outState.putString("pending_export", pendingExportId)
        outState.putBoolean("pending_toggle", pendingToggle)
        super.onSaveInstanceState(outState)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        entryState.restoreInternalReturn(savedInstanceState?.getBoolean("internal_return") == true,
            savedInstanceState?.getString("capture_request"))
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
                val isRecording by VoiceRecordingService.isRecording.collectAsState()
                val elapsedSeconds by VoiceRecordingService.elapsedDurationSeconds.collectAsState()
                val recordings by repository.recordings.collectAsState()
                val playingId by audioPlayer.playingId.collectAsState()
                val isPlaying by audioPlayer.isPlaying.collectAsState()
                var openDetailId by rememberSaveable { mutableStateOf<String?>(null) }
                val listState = rememberScalingLazyListState(initialCenterItemIndex = 0)
                var handledRequest by rememberSaveable { mutableStateOf<String?>(null) }
                var notice by rememberSaveable { mutableStateOf<String?>(null) }
                val request = entryState.request
                val playbackError by audioPlayer.error.collectAsState()
                LaunchedEffect(request) {
                    if (handledRequest != request) {
                        audioPlayer.stop()
                        openDetailId = null
                        listState.scrollToItem(0)
                        handledRequest = request
                    }
                }

                // Refresh recordings when recording completes
                LaunchedEffect(isRecording) {
                    while (!isRecording) {
                        repository.refresh()
                        kotlinx.coroutines.delay(5000)
                    }
                }

                LaunchedEffect(openDetailId) {
                    if (openDetailId != null) repository.refresh()
                }

                DisposableEffect(Unit) {
                    onDispose {
                        audioPlayer.release()
                    }
                }

                // A recording that is no longer on disk falls back to the list.
                val detailItem = openDetailId?.let { id -> recordings.firstOrNull { it.id == id } }

                if (detailItem != null) {
                    // Playback has no control on the list, so leaving the detail screen must stop it.
                    BackHandler {
                        audioPlayer.stop()
                        openDetailId = null
                    }
                    RecordingDetailScreen(
                        item = detailItem,
                        isPlaying = playingId == detailItem.id && isPlaying,
                        onTogglePlay = { audioPlayer.togglePlay(detailItem.audioFile, detailItem.id) },
                        onExport = { exportRecording(detailItem) },
                        onRetry = {
                            RecordingSyncWorker.retry(this, detailItem.id)
                            repository.refresh()
                        },
                        cloudEnabled = cloudSyncEnabled,
                        notice = notice ?: playbackError?.let { getString(if (it == WatchAudioPlayer.Failure.MISSING_AUDIO) R.string.audio_missing else R.string.audio_failed) },
                        onOpenMap = {
                            entryState.beginInternalReturn()
                            try {
                                startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(
                                    "geo:${detailItem.latitude},${detailItem.longitude}?q=${detailItem.latitude},${detailItem.longitude}")))
                            } catch (_: ActivityNotFoundException) {
                                entryState.cancelInternalReturn()
                                notice = getString(R.string.no_map_app)
                            }
                        },
                        onDelete = {
                            if (playingId == detailItem.id) audioPlayer.stop()
                            if (repository.deleteRecording(detailItem.id)) {
                                notice = null
                                openDetailId = null
                            } else {
                                notice = localDeleteFailure(this, detailItem)
                                repository.refresh()
                            }
                        }
                    )
                } else {
                    HaptiLogScreen(
                        isRecording = isRecording,
                        elapsedSeconds = elapsedSeconds,
                        recordings = recordings,
                        listState = listState,
                        cloudEnabled = cloudSyncEnabled,
                        notice = notice,
                        onToggleRecording = ::toggleRecording,
                        onOpenRecording = { item -> notice = null; audioPlayer.dismissError(); openDetailId = item.id },
                        onSettings = { if (!isRecording) {
                            entryState.beginInternalReturn()
                            startActivity(Intent(this, SettingsActivity::class.java))
                        } }
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        entryState.resumed()
        cloudSyncEnabled = RecordingSyncWorker.enabled(this)
        repository.refresh()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        entryState.userLeaving()
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
    listState: ScalingLazyListState,
    cloudEnabled: Boolean,
    notice: String?,
    onToggleRecording: () -> Unit,
    onOpenRecording: (RecordingItem) -> Unit,
    onSettings: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

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
            // 2. Hero Record Action Button
            item {
                RecordHeroSection(
                    isRecording = isRecording,
                    elapsedSeconds = elapsedSeconds,
                    onToggleRecording = onToggleRecording
                )
            }

            // Navigation stays ahead of the unbounded recording list.
            item {
                FlexibleChip(
                    enabled = !isRecording,
                    onClick = onSettings,
                    label = { Text(stringResource(R.string.settings_title), fontSize = 14.sp, maxLines = Int.MAX_VALUE) },
                    icon = { Icon(painterResource(R.drawable.ic_settings), contentDescription = null, modifier = Modifier.size(20.dp)) },
                    modifier = Modifier.fillMaxWidth(0.86f)
                )
            }

            notice?.let { message -> item { Text(message, color = WatchColors.Error, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(0.86f)) } }

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
                        text = stringResource(R.string.recent_recordings),
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
                    RecordingCard(item = item, cloudEnabled = cloudEnabled, onOpen = { onOpenRecording(item) })
                    Spacer(modifier = Modifier.height(6.dp))
                }
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

    val action = stringResource(if (isRecording) R.string.record_stop_accessibility else R.string.record_start_accessibility)
    val recordState = stringResource(if (isRecording) R.string.recording_state else R.string.recording_idle)
    val discSize = maxOf(108f, 72f * LocalDensity.current.fontScale).dp
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.size(discSize + 18.dp)
    ) {
        // Subtle 1px Edge Luminance breathing when recording
        if (isRecording) {
            Box(
                modifier = Modifier
                    .size(discSize + 18.dp)
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
                .size(discSize)
                .semantics(mergeDescendants = true) {
                    contentDescription = action
                    stateDescription = recordState
                }
                .border(
                    width = 1.dp,
                    color = if (isRecording) Color(0xFFFF3B30).copy(alpha = 0.5f) else Color(0xFF2C2C2E),
                    shape = CircleShape
                ),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                backgroundColor = if (isRecording) WatchColors.Recording else WatchColors.Record
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
                        fontSize = 22.sp,
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
                            text = stringResource(R.string.record_stop),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFFF453A),
                            letterSpacing = 0.sp
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(Color.White, CircleShape)
                    )
                    Spacer(modifier = Modifier.height(7.dp))
                    Text(
                        text = stringResource(R.string.record_start),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.sp,
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
                text = stringResource(R.string.no_recordings),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFF8E8E93)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.first_recording_hint),
                fontSize = 10.sp,
                color = Color(0xFF636366),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun RecordingCard(item: RecordingItem, cloudEnabled: Boolean, onOpen: () -> Unit) {
    val context = LocalContext.current
    val hasSummary = !item.summary.isNullOrBlank()
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(0.9f),
        backgroundPainter = CardDefaults.cardBackgroundPainter(
            startBackgroundColor = Color(0xFF171D19), endBackgroundColor = Color(0xFF171D19)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.fillMaxWidth().padding(4.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(recordingTitle(context, item), fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis, color = WatchColors.Text)
            Text(stringResource(R.string.recording_metadata, recordingDate(context, item),
                stringResource(R.string.duration_seconds, item.durationSeconds)), fontSize = 12.sp, color = WatchColors.Muted)
            Text((if (hasSummary) stringResource(R.string.ai_summary) + " · " else "") + categoryLabel(context, item.intentType),
                fontSize = 12.sp, color = WatchColors.Muted)
            if (!cloudEnabled || item.syncStatus == "ACTION_REQUIRED") {
                Text(recordingSyncLabel(context, item, cloudEnabled), fontSize = 12.sp,
                    color = if (item.syncStatus == "ACTION_REQUIRED") WatchColors.Error else WatchColors.Muted)
            }
        }
    }
}
