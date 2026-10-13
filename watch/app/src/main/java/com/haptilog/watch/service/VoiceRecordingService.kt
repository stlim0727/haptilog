package com.haptilog.watch.service

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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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
    }

    private var mediaRecorder: MediaRecorder? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var currentAudioFile: File? = null
    private var currentSessionId: String? = null
    private var startTimeMs: Long = 0L

    private lateinit var hapticManager: HapticHeartbeatManager
    private lateinit var locationProvider: LocationSnapshotProvider
    private val serviceScope = CoroutineScope(Dispatchers.IO)
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

        wakeLock?.acquire(MAX_RECORDING_MS + 5000L)
        val notification = buildForegroundNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            startForeground(NOTIFICATION_ID, notification, type)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        currentSessionId = UUID.randomUUID().toString()
        startTimeMs = System.currentTimeMillis()

        // 1. Immediate start haptic & heartbeat pulse
        hapticManager.playStartFeedback()
        hapticManager.startHeartbeatLoop()

        // 2. Setup audio file & MediaRecorder
        val recordingsDir = File(filesDir, "recordings").apply { mkdirs() }
        currentAudioFile = File(recordingsDir, "rec_${currentSessionId}.m4a")

        try {
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

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

            // 3. Concurrently snapshot location
            serviceScope.launch {
                val loc = locationProvider.getFastLocationSnapshot()
                saveMetadataSnapshot(loc)
            }

            // 4. Safety auto-timeout
            timeoutJob?.cancel()
            timeoutJob = serviceScope.launch {
                delay(MAX_RECORDING_MS)
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

        timeoutJob?.cancel()
        timeoutJob = null

        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            mediaRecorder = null
        }

        _isRecording.value = false
        hapticManager.playStopFeedback()

        // Update metadata with final duration
        finalizeMetadata()

        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun saveMetadataSnapshot(location: LocationSnapshot?) {
        val sessionId = currentSessionId ?: return
        val recordingsDir = File(filesDir, "recordings")
        val metaFile = File(recordingsDir, "meta_${sessionId}.json")

        val json = JSONObject().apply {
            put("id", sessionId)
            put("started_at", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date(startTimeMs)))
            put("status", "RECORDING")
            if (location != null) {
                put("latitude", location.latitude)
                put("longitude", location.longitude)
                put("altitude", location.altitude)
                put("speed", location.speed)
                put("accuracy", location.accuracy)
            }
        }
        metaFile.writeText(json.toString())
    }

    private fun finalizeMetadata() {
        val sessionId = currentSessionId ?: return
        val recordingsDir = File(filesDir, "recordings")
        val metaFile = File(recordingsDir, "meta_${sessionId}.json")
        val durationSec = ((System.currentTimeMillis() - startTimeMs) / 1000).toInt()

        try {
            val json = if (metaFile.exists()) JSONObject(metaFile.readText()) else JSONObject()
            json.put("duration_seconds", durationSec)
            json.put("status", "COMPLETED")
            json.put("sync_status", "PENDING_SYNC")
            metaFile.writeText(json.toString())
        } catch (_: Exception) {}
    }

    private fun cleanupFailure() {
        _isRecording.value = false
        hapticManager.stop()
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
        super.onDestroy()
        hapticManager.stop()
        if (wakeLock?.isHeld == true) wakeLock?.release()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
