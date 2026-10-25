package com.haptilog.watch.presentation.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

/**
 * Wrist audio player for previewing captured voice recordings on Galaxy Watch speakers
 * or connected Galaxy Buds/Bluetooth audio devices.
 */
class WatchAudioPlayer(private val context: Context) {

    enum class Failure { MISSING_AUDIO, PLAYBACK }
    private val _error = MutableStateFlow<Failure?>(null)
    val error: StateFlow<Failure?> = _error.asStateFlow()
    fun dismissError() { _error.value = null }

    private var mediaPlayer: MediaPlayer? = null
    private val scope = CoroutineScope(Dispatchers.Main.immediate)
    private var progressJob: Job? = null

    private val _playingId = MutableStateFlow<String?>(null)
    val playingId: StateFlow<String?> = _playingId.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _currentPositionMs = MutableStateFlow(0)
    val currentPositionMs: StateFlow<Int> = _currentPositionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0)
    val durationMs: StateFlow<Int> = _durationMs.asStateFlow()

    fun togglePlay(file: File, id: String) {
        if (_playingId.value == id && _isPlaying.value) {
            pause()
        } else if (_playingId.value == id && mediaPlayer != null) {
            resume()
        } else {
            play(file, id)
        }
    }

    fun play(file: File, id: String) {
        stop()
        _error.value = null
        if (!file.isFile || file.length() == 0L) {
            _error.value = Failure.MISSING_AUDIO
            return
        }

        try {
            val player = MediaPlayer()
            mediaPlayer = player
            player.apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setDataSource(context, Uri.fromFile(file))
                prepare()
                setOnCompletionListener {
                    _isPlaying.value = false
                    _currentPositionMs.value = 0
                    stopProgressTracker()
                }
                setOnErrorListener { _, _, _ ->
                    stop()
                    _error.value = Failure.PLAYBACK
                    true
                }
                start()
            }
            mediaPlayer = player
            _playingId.value = id
            _isPlaying.value = true
            _durationMs.value = player.duration.coerceAtLeast(0)
            _currentPositionMs.value = player.currentPosition.coerceAtLeast(0)
            startProgressTracker()
        } catch (e: Exception) {
            e.printStackTrace()
            stop()
            _error.value = Failure.PLAYBACK
        }
    }

    fun pause() {
        try {
            mediaPlayer?.pause()
            _isPlaying.value = false
            stopProgressTracker()
            mediaPlayer?.let { _currentPositionMs.value = it.currentPosition.coerceAtLeast(0) }
        } catch (_: Exception) {}
    }

    fun resume() {
        try {
            mediaPlayer?.start()
            _isPlaying.value = true
            startProgressTracker()
        } catch (_: Exception) {}
    }

    fun seekTo(positionMs: Int) {
        mediaPlayer?.let { player ->
            try {
                val dur = _durationMs.value.takeIf { it > 0 } ?: player.duration
                if (dur > 0) {
                    val clamped = positionMs.coerceIn(0, dur)
                    player.seekTo(clamped)
                    _currentPositionMs.value = clamped
                }
            } catch (_: Exception) {}
        }
    }

    fun seekBy(deltaMs: Int) {
        mediaPlayer?.let { player ->
            try {
                val current = player.currentPosition
                seekTo(current + deltaMs)
            } catch (_: Exception) {}
        }
    }

    private fun startProgressTracker() {
        stopProgressTracker()
        progressJob = scope.launch {
            while (isActive) {
                mediaPlayer?.let { player ->
                    try {
                        if (player.isPlaying) {
                            _currentPositionMs.value = player.currentPosition.coerceAtLeast(0)
                        }
                    } catch (_: Exception) {}
                }
                delay(200)
            }
        }
    }

    private fun stopProgressTracker() {
        progressJob?.cancel()
        progressJob = null
    }

    fun stop() {
        stopProgressTracker()
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
        } catch (_: Exception) {}
        mediaPlayer = null
        _playingId.value = null
        _isPlaying.value = false
        _currentPositionMs.value = 0
        _durationMs.value = 0
    }

    fun release() {
        stop()
    }
}
