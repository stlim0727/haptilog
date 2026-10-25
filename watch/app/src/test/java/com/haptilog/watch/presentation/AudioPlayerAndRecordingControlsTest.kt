package com.haptilog.watch.presentation

import android.content.Context
import com.haptilog.watch.R
import com.haptilog.watch.presentation.audio.WatchAudioPlayer
import com.haptilog.watch.service.VoiceRecordingService
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = android.app.Application::class)
class AudioPlayerAndRecordingControlsTest {

    private lateinit var context: Context

    @Before
    fun setup() {
        context = RuntimeEnvironment.getApplication()
    }

    @Test
    fun audioPlayerInitialStateIsClean() {
        val player = WatchAudioPlayer(context)
        assertFalse(player.isPlaying.value)
        assertNull(player.playingId.value)
        assertEquals(0, player.currentPositionMs.value)
        assertEquals(0, player.durationMs.value)
        assertNull(player.error.value)
    }

    @Test
    fun audioPlayerMissingFileSetsAppropriateError() {
        val player = WatchAudioPlayer(context)
        val missingFile = File(context.cacheDir, "non_existent.m4a")
        player.play(missingFile, "test-id")

        assertEquals(WatchAudioPlayer.Failure.MISSING_AUDIO, player.error.value)
        assertFalse(player.isPlaying.value)
        assertNull(player.playingId.value)
    }

    @Test
    fun audioPlayerSeekOperationsAreSafeWithoutActivePlayback() {
        val player = WatchAudioPlayer(context)
        // Should not throw NPE or IndexOutOfBounds
        player.seekTo(5000)
        player.seekBy(-1000)
        player.seekBy(3000)
        assertEquals(0, player.currentPositionMs.value)
    }

    @Test
    fun voiceRecordingServiceExposesPauseConstantsAndState() {
        assertEquals("com.haptilog.watch.action.PAUSE", VoiceRecordingService.ACTION_PAUSE)
        assertEquals("com.haptilog.watch.action.RESUME", VoiceRecordingService.ACTION_RESUME)
        assertEquals("com.haptilog.watch.action.TOGGLE_PAUSE", VoiceRecordingService.ACTION_TOGGLE_PAUSE)
        assertFalse(VoiceRecordingService.isPaused.value)
    }

    @Test
    fun stringsAreLocalizedForBothDefaultAndKorean() {
        val res = context.resources

        // Test in Korean
        val configKo = context.resources.configuration
        configKo.setLocale(Locale.KOREAN)
        val contextKo = context.createConfigurationContext(configKo)

        assertEquals("일시정지", contextKo.getString(R.string.record_pause))
        assertEquals("이어서 녹음", contextKo.getString(R.string.record_resume))
        assertEquals("일시정지됨", contextKo.getString(R.string.recording_paused))
        assertEquals("5초 뒤로", contextKo.getString(R.string.seek_backward_5))
        assertEquals("5초 앞으로", contextKo.getString(R.string.seek_forward_5))

        // Test in English
        val configEn = context.resources.configuration
        configEn.setLocale(Locale.ENGLISH)
        val contextEn = context.createConfigurationContext(configEn)

        assertEquals("Pause", contextEn.getString(R.string.record_pause))
        assertEquals("Resume", contextEn.getString(R.string.record_resume))
        assertEquals("Paused", contextEn.getString(R.string.recording_paused))
        assertEquals("Rewind 5s", contextEn.getString(R.string.seek_backward_5))
        assertEquals("Forward 5s", contextEn.getString(R.string.seek_forward_5))
    }
}
