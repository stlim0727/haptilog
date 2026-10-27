package com.haptilog.watch.service

import com.haptilog.watch.R
import com.haptilog.watch.notifications.RecordingNotifications
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.util.AtomicFile
import android.os.SystemClock
import java.time.Instant
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.haptilog.watch.data.LocationSnapshot
import com.haptilog.watch.data.LocationSnapshotProvider
import com.haptilog.watch.presentation.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.util.UUID

class VoiceRecordingService : Service() {

    companion object {
        const val ACTION_START = "com.haptilog.watch.action.START"
        const val ACTION_STOP = "com.haptilog.watch.action.STOP"
        const val ACTION_TOGGLE = "com.haptilog.watch.action.TOGGLE"
        const val ACTION_PAUSE = "com.haptilog.watch.action.PAUSE"
        const val ACTION_RESUME = "com.haptilog.watch.action.RESUME"
        const val ACTION_TOGGLE_PAUSE = "com.haptilog.watch.action.TOGGLE_PAUSE"

        private const val CHANNEL_ID = "haptilog_recording_channel"
        private const val NOTIFICATION_ID = 1001
        private const val MAX_RECORDING_MS = 180_000L // 3 minutes safety timeout

        private val _isRecording = MutableStateFlow(false)
        val isRecording: StateFlow<Boolean> = _isRecording

        private val _isPaused = MutableStateFlow(false)
        val isPaused: StateFlow<Boolean> = _isPaused

        private val _elapsedDurationSeconds = MutableStateFlow(0L)
        val elapsedDurationSeconds: StateFlow<Long> = _elapsedDurationSeconds
    }

    private var mediaRecorder: MediaRecorder? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var currentAudioFile: File? = null
    private var currentSessionId: String? = null
    private var startTimeMs: Long = 0L
    private var elapsedStartMs: Long = 0L
    private var accumulatedElapsedMs: Long = 0L
    private var metadata = JSONObject()
    private val collectionListener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == "scope" && !com.haptilog.watch.data.location.LocationCollection.load(this).includesRecordings) {
            locationJob?.cancel()
            locationJob = null
        }
    }
    private var locationJob: Job? = null
    private var timerJob: Job? = null

    private lateinit var hapticManager: HapticHeartbeatManager
    private lateinit var locationProvider: LocationSnapshotProvider
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var timeoutJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        hapticManager = HapticHeartbeatManager(this)
        locationProvider = LocationSnapshotProvider(this)
        getSharedPreferences("location_collection", MODE_PRIVATE).registerOnSharedPreferenceChangeListener(collectionListener)
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HaptiLog:RecordingLock")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startRecording()
            ACTION_STOP -> if (_isRecording.value) stopRecording() else stopSelf()
            ACTION_TOGGLE -> {
                if (_isRecording.value) stopRecording() else startRecording()
            }
            ACTION_PAUSE -> if (_isRecording.value && !_isPaused.value) pauseRecording()
            ACTION_RESUME -> if (_isRecording.value && _isPaused.value) resumeRecording()
            ACTION_TOGGLE_PAUSE -> {
                if (_isRecording.value) {
                    if (_isPaused.value) resumeRecording() else pauseRecording()
                }
            }
        }
        return START_NOT_STICKY
    }

    private fun startRecording() {
        if (_isRecording.value) return

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            hapticManager.playFailureFeedback()
            RecordingNotifications.captureFailed(this)
            stopSelf()
            return
        }

        try {
            val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                if (com.haptilog.watch.data.location.LocationCollection.load(this).includesRecordings &&
                    locationProvider.hasLocationPermission() && locationProvider.isLocationEnabled())
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
            startForeground(NOTIFICATION_ID, buildForegroundNotification(), type)
            wakeLock?.acquire(MAX_RECORDING_MS + 5000L)
            currentSessionId = UUID.randomUUID().toString()
            startTimeMs = System.currentTimeMillis()
            elapsedStartMs = SystemClock.elapsedRealtime()
            val recordingsDir = File(filesDir, "recordings").apply { mkdirs() }
            currentAudioFile = File(recordingsDir, "rec_${currentSessionId}.m4a")
            metadata = JSONObject().apply {
                put("id", currentSessionId)
                put("started_at", Instant.ofEpochMilli(startTimeMs).toString())
                put("status", "RECORDING")
            }
            writeMetadata()

            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

            mediaRecorder = recorder
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(16000) // 16kHz is ideal for speech and saves battery
                setAudioEncodingBitRate(32000)
                setAudioChannels(1) // Mono
                setOutputFile(currentAudioFile?.absolutePath)
                prepare()
                start()
            }
            mediaRecorder = recorder
            _isRecording.value = true
            _isPaused.value = false
            accumulatedElapsedMs = 0L
            _elapsedDurationSeconds.value = 0L
            hapticManager.playStartFeedback()
            hapticManager.startHeartbeatLoop()

            startTimer()

            val sessionId = currentSessionId
            if (com.haptilog.watch.data.location.LocationCollection.load(this).includesRecordings) locationJob = serviceScope.launch {
                locationProvider.capture { loc ->
                    if (_isRecording.value && currentSessionId == sessionId &&
                        com.haptilog.watch.data.location.LocationCollection.load(this@VoiceRecordingService).includesRecordings) {
                        saveMetadataSnapshot(loc)
                    }
                }
            }

            startTimeout(MAX_RECORDING_MS)

        } catch (e: Exception) {
            e.printStackTrace()
            cleanupFailure()
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = serviceScope.launch {
            while (_isRecording.value && !_isPaused.value) {
                val currentSessionMs = (SystemClock.elapsedRealtime() - elapsedStartMs).coerceAtLeast(0L)
                val totalSeconds = ((accumulatedElapsedMs + currentSessionMs) / 1000L).coerceAtLeast(0L)
                _elapsedDurationSeconds.value = totalSeconds
                delay(500L)
            }
        }
    }

    private fun startTimeout(remainingMs: Long) {
        timeoutJob?.cancel()
        timeoutJob = serviceScope.launch {
            val warningDelayMs = (remainingMs - 30_000L).coerceAtLeast(0L)
            if (warningDelayMs > 0) {
                delay(warningDelayMs)
                if (_isRecording.value && !_isPaused.value) {
                    hapticManager.playTimeoutWarningFeedback()
                }
                delay(remainingMs - warningDelayMs)
            } else {
                delay(remainingMs.coerceAtLeast(0L))
            }
            if (_isRecording.value) {
                stopRecording(autoStopped = true)
            }
        }
    }

    private fun pauseRecording() {
        if (!_isRecording.value || _isPaused.value) return
        try {
            mediaRecorder?.pause()
            _isPaused.value = true
            accumulatedElapsedMs += (SystemClock.elapsedRealtime() - elapsedStartMs).coerceAtLeast(0L)
            _elapsedDurationSeconds.value = (accumulatedElapsedMs / 1000L).coerceAtLeast(0L)
            timerJob?.cancel()
            timeoutJob?.cancel()
            if (wakeLock?.isHeld == true) wakeLock?.release()
            hapticManager.playPauseFeedback()
            updateForegroundNotification()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun resumeRecording() {
        if (!_isRecording.value || !_isPaused.value) return
        val remainingMs = MAX_RECORDING_MS - accumulatedElapsedMs
        if (remainingMs <= 0L) {
            stopRecording(autoStopped = true)
            return
        }
        try {
            mediaRecorder?.resume()
            _isPaused.value = false
            elapsedStartMs = SystemClock.elapsedRealtime()
            if (wakeLock?.isHeld == true) wakeLock?.release()
            wakeLock?.acquire(remainingMs + 5000L)
            hapticManager.playStartFeedback()
            hapticManager.startHeartbeatLoop()
            startTimer()
            startTimeout(remainingMs)
            updateForegroundNotification()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopRecording(autoStopped: Boolean = false) {
        if (!_isRecording.value) return

        timerJob?.cancel()
        timerJob = null

        timeoutJob?.cancel()
        timeoutJob = null

        locationJob?.cancel()
        locationJob = null
        var saved = false
        try {
            mediaRecorder?.stop()
            saved = currentAudioFile?.let { it.exists() && it.length() > 0 } == true
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            runCatching { mediaRecorder?.release() }
            mediaRecorder = null
        }
        val finalElapsedMs = accumulatedElapsedMs + if (_isPaused.value) 0L else (SystemClock.elapsedRealtime() - elapsedStartMs).coerceAtLeast(0L)
        val finalSeconds = (finalElapsedMs / 1000L).coerceAtLeast(0L).toInt()

        _isRecording.value = false
        _isPaused.value = false
        accumulatedElapsedMs = 0L
        _elapsedDurationSeconds.value = 0L
        hapticManager.stop()
        try {
            metadata.put("duration_seconds", finalSeconds)
            metadata.put("status", if (saved) "COMPLETED" else "FAILED")
            metadata.put("sync_status", if (saved) "PENDING_SYNC" else "CAPTURE_FAILED")
            writeMetadata()
        } catch (e: Exception) {
            saved = false
            e.printStackTrace()
        }
        if (wakeLock?.isHeld == true) wakeLock?.release()
        if (saved) {
            hapticManager.playStopFeedback()
            com.haptilog.watch.sync.RecordingSyncWorker.schedule(this)
            if (autoStopped) RecordingNotifications.autoStopped(this)
        } else {
            hapticManager.playFailureFeedback()
            RecordingNotifications.captureFailed(this)
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun saveMetadataSnapshot(location: LocationSnapshot) {
        metadata.apply {
            put("latitude", location.latitude)
            put("longitude", location.longitude)
            put("altitude", location.altitude)
            put("speed", location.speed)
            put("accuracy", location.accuracy)
            put("location_timestamp", Instant.ofEpochMilli(location.timestamp).toString())
        }
        try {
            writeMetadata()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun writeMetadata() {
        val sessionId = currentSessionId ?: return
        val file = AtomicFile(File(File(filesDir, "recordings"), "meta_${sessionId}.json"))
        val output = file.startWrite()
        try {
            output.write(metadata.toString().toByteArray(Charsets.UTF_8))
            file.finishWrite(output)
        } catch (e: Exception) {
            file.failWrite(output)
            throw e
        }
    }

    private fun cleanupFailure() {
        _isRecording.value = false
        timerJob?.cancel()
        timerJob = null
        _elapsedDurationSeconds.value = 0L
        locationJob?.cancel()
        timeoutJob?.cancel()
        runCatching { mediaRecorder?.release() }
        mediaRecorder = null
        runCatching {
            metadata.put("status", "FAILED")
            metadata.put("sync_status", "CAPTURE_FAILED")
            writeMetadata()
        }
        hapticManager.stop()
        hapticManager.playFailureFeedback()
        if (wakeLock?.isHeld == true) wakeLock?.release()
        stopForeground(STOP_FOREGROUND_REMOVE)
        RecordingNotifications.captureFailed(this)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_recording_channel),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_recording_body)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        val contentText = if (_isPaused.value) getString(R.string.recording_paused) else getString(R.string.notification_recording_body)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_recording_title))
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_media_pause, getString(R.string.notification_stop),
                PendingIntent.getService(this, 1002,
                    Intent(this, VoiceRecordingService::class.java).setAction(ACTION_STOP),
                    PendingIntent.FLAG_IMMUTABLE))
            .setOnlyAlertOnce(true)
            .setLocalOnly(true)
            .setOngoing(true)
            .build()
    }

    private fun updateForegroundNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildForegroundNotification())
    }

    override fun onDestroy() {
        getSharedPreferences("location_collection", MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(collectionListener)
        if (_isRecording.value) stopRecording()
        serviceScope.cancel()
        runCatching { mediaRecorder?.release() }
        mediaRecorder = null
        super.onDestroy()
        hapticManager.stop(cancelVibration = false)
        if (wakeLock?.isHeld == true) wakeLock?.release()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
