package com.haptilog.watch.presentation

import com.haptilog.watch.notifications.RecordingNotifications
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.core.content.ContextCompat
import androidx.wear.compose.material3.AppScaffold
import com.haptilog.watch.R
import com.haptilog.watch.data.RecordingItem
import com.haptilog.watch.data.RecordingRepository
import com.haptilog.watch.presentation.audio.WatchAudioPlayer
import com.haptilog.watch.service.VoiceRecordingService
import kotlinx.coroutines.launch

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
            val permissions = mutableListOf(Manifest.permission.RECORD_AUDIO)
            if (com.haptilog.watch.data.location.LocationCollection.load(this).includesRecordings) {
                permissions += Manifest.permission.ACCESS_FINE_LOCATION
                permissions += Manifest.permission.ACCESS_COARSE_LOCATION
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    private fun togglePause() {
        if (VoiceRecordingService.isRecording.value) {
            startService(Intent(this, VoiceRecordingService::class.java).apply {
                action = VoiceRecordingService.ACTION_TOGGLE_PAUSE
            })
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
            HaptiLogTheme {
                AppScaffold {
                    val isRecording by VoiceRecordingService.isRecording.collectAsState()
                    val isPaused by VoiceRecordingService.isPaused.collectAsState()
                    val elapsedSeconds by VoiceRecordingService.elapsedDurationSeconds.collectAsState()
                    val recordings by repository.recordings.collectAsState()
                    val playingId by audioPlayer.playingId.collectAsState()
                    val isPlaying by audioPlayer.isPlaying.collectAsState()
                    val currentPositionMs by audioPlayer.currentPositionMs.collectAsState()
                    val durationMs by audioPlayer.durationMs.collectAsState()
                    var showRecordings by rememberSaveable { mutableStateOf(false) }
                    var openDetailId by rememberSaveable { mutableStateOf<String?>(null) }
                    val listState = androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState()
                    var handledRequest by rememberSaveable { mutableStateOf<String?>(null) }
                    var notice by rememberSaveable { mutableStateOf<String?>(null) }
                    val request = entryState.request
                    val playbackError by audioPlayer.error.collectAsState()
                    LaunchedEffect(request) {
                        if (handledRequest != request) {
                            audioPlayer.stop()
                            openDetailId = null
                            showRecordings = intent.getBooleanExtra(RecordingNotifications.EXTRA_RECORDINGS, false)
                            intent.removeExtra(RecordingNotifications.EXTRA_RECORDINGS)
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

                    if (isRecording) {
                        CaptureScreen(isRecording = true, isPaused = isPaused, elapsedSeconds = elapsedSeconds,
                            onToggleRecording = ::toggleRecording, onTogglePause = ::togglePause,
                            onRecordings = {}, onSettings = {})
                    } else if (detailItem != null) {
                        // Playback has no control on the list, so leaving the detail screen must stop it.
                        BackHandler {
                            audioPlayer.stop()
                            openDetailId = null
                        }
                        RecordingDetailScreen(
                            item = detailItem,
                            isPlaying = playingId == detailItem.id && isPlaying,
                            currentPositionMs = if (playingId == detailItem.id) currentPositionMs else 0,
                            durationMs = if (playingId == detailItem.id) durationMs else (detailItem.durationSeconds * 1000),
                            onSeekBy = { deltaMs -> audioPlayer.seekBy(deltaMs) },
                            onTogglePlay = { audioPlayer.togglePlay(detailItem.audioFile, detailItem.id) },
                            onExport = { exportRecording(detailItem) },
                            onRetry = {
                                RecordingSyncWorker.retry(this@MainActivity, detailItem.id)
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
                                    notice = localDeleteFailure(this@MainActivity, detailItem)
                                    repository.refresh()
                                }
                            }
                        )
                    } else if (showRecordings) {
                        BackHandler { showRecordings = false }
                        RecordingsScreen(
                            recordings = recordings,
                            listState = listState,
                            cloudEnabled = cloudSyncEnabled,
                            notice = notice,
                            onOpenRecording = { item -> notice = null; audioPlayer.dismissError(); openDetailId = item.id },
                        )
                    } else {
                        CaptureScreen(isRecording = false, elapsedSeconds = elapsedSeconds,
                            onToggleRecording = ::toggleRecording,
                            onRecordings = { showRecordings = true },
                            onSettings = {
                                entryState.beginInternalReturn()
                                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                            })
                    }
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
