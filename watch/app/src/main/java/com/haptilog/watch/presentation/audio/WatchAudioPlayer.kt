package com.haptilog.watch.presentation.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/**
 * Wrist audio player for previewing captured voice recordings on Galaxy Watch speakers
 * or connected Galaxy Buds/Bluetooth audio devices.
 */
class WatchAudioPlayer(private val context: Context) {

    private var mediaPlayer: MediaPlayer? = null

    private val _playingId = MutableStateFlow<String?>(null)
    val playingId: StateFlow<String?> = _playingId.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    fun togglePlay(file: File, id: String) {
        if (_playingId.value == id && _isPlaying.value) {
            stop()
        } else {
            play(file, id)
        }
    }

    fun play(file: File, id: String) {
        if (!file.exists() || file.length() == 0L) return

        stop()

        try {
            val player = MediaPlayer().apply {
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
                    _playingId.value = null
                }
                start()
            }
            mediaPlayer = player
            _playingId.value = id
            _isPlaying.value = true
        } catch (e: Exception) {
            e.printStackTrace()
            stop()
        }
    }

    fun stop() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
        } catch (_: Exception) {}
        mediaPlayer = null
        _playingId.value = null
        _isPlaying.value = false
    }

    fun release() {
        stop()
    }
}
