package com.haptilog.watch.service

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

        private const val CHANNEL_ID = "haptilog_recording_channel"
        private const val NOTIFICATION_ID = 1001
        private const val MAX_RECORDING_MS = 180_000L // 3 minutes safety timeout

        private val _isRecording = MutableStateFlow(false)
        val isRecording: StateFlow<Boolean> = _isRecording

        private val _elapsedDurationSeconds = MutableStateFlow(0L)
        val elapsedDurationSeconds: StateFlow<Long> = _elapsedDurationSeconds
    }

    private var mediaRecorder: MediaRecorder? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var currentAudioFile: File? = null
    private var currentSessionId: String? = null
    private var startTimeMs: Long = 0L
    private var elapsedStartMs: Long = 0L
    private var metadata = JSONObject()
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
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HaptiLog:RecordingLock")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startRecording()
            ACTION_STOP -> stopRecording()
            ACTION_TOGGLE -> {
                if (_isRecording.value) stopRecording() else startRecording()
            }
        }
        return START_NOT_STICKY
    }

    private fun startRecording() {
        if (_isRecording.value) return

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            hapticManager.playFailureFeedback()
            stopSelf()
            return
        }

        try {
            val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                if (locationProvider.hasLocationPermission() && locationProvider.isLocationEnabled())
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
            _elapsedDurationSeconds.value = 0L
            hapticManager.playStartFeedback()
            hapticManager.startHeartbeatLoop()

            timerJob?.cancel()
            timerJob = serviceScope.launch {
                while (_isRecording.value) {
                    val seconds = ((SystemClock.elapsedRealtime() - elapsedStartMs) / 1000L).coerceAtLeast(0L)
                    _elapsedDurationSeconds.value = seconds
                    delay(500L)
                }
            }

            val sessionId = currentSessionId
            locationJob = serviceScope.launch {
                locationProvider.capture { loc ->
                    if (_isRecording.value && currentSessionId == sessionId) {
                        saveMetadataSnapshot(loc)
                    }
                }
            }

            // 4. Safety auto-timeout with tactile warning at 150s (30s before auto-stop)
            timeoutJob?.cancel()
            timeoutJob = serviceScope.launch {
                val warningDelayMs = (MAX_RECORDING_MS - 30_000L).coerceAtLeast(0L)
                delay(warningDelayMs)
                if (_isRecording.value) {
                    hapticManager.playTimeoutWarningFeedback()
                }
                delay(MAX_RECORDING_MS - warningDelayMs)
                if (_isRecording.value) {
                    stopRecording()
                }
            }

        } catch (e: Exception) {
            e.printStackTrace()
            cleanupFailure()
        }
    }

    private fun stopRecording() {
        if (!_isRecording.value) return

        timerJob?.cancel()
        timerJob = null
        _elapsedDurationSeconds.value = 0L

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
        _isRecording.value = false
        hapticManager.stop()
        try {
            metadata.put("duration_seconds", ((SystemClock.elapsedRealtime() - elapsedStartMs) / 1000).toInt())
            metadata.put("status", if (saved) "COMPLETED" else "FAILED")
            metadata.put("sync_status", if (saved) "PENDING_SYNC" else "CAPTURE_FAILED")
            writeMetadata()
        } catch (e: Exception) {
            saved = false
            e.printStackTrace()
        }
        if (saved) {
            hapticManager.playStopFeedback()
            com.haptilog.watch.sync.RecordingSyncWorker.schedule(this)
        } else hapticManager.playFailureFeedback()
        if (wakeLock?.isHeld == true) wakeLock?.release()
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
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice Recording Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows ongoing status of HaptiLog voice capture"
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

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("HaptiLog Recording")
            .setContentText("Capturing voice & location...")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
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
