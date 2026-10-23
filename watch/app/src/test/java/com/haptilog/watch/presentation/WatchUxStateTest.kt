package com.haptilog.watch.presentation

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import com.haptilog.watch.R
import com.haptilog.watch.data.RecordingItem
import com.haptilog.watch.data.RecordingFiles
import com.haptilog.watch.data.RecordingRepository
import com.haptilog.watch.presentation.audio.WatchAudioPlayer
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.util.Locale
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = Application::class)
class WatchUxStateTest {
    private fun context(language: String = "en"): Context {
        val original = RuntimeEnvironment.getApplication()
        val config = Configuration(original.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) }
        return original.createConfigurationContext(config)
    }
    private fun recording(ctx: Context = context()): RecordingItem {
        val id = UUID.randomUUID().toString()
        val dir = RecordingFiles.dir(ctx)
        return RecordingItem(id, File(dir, "rec_$id.m4a"), File(dir, "meta_$id.json"),
            "2026-10-23T14:35:00Z", 1_792_766_100_000L, 18, "COMPLETED", "PENDING_SYNC")
    }

    @Test fun externalEntryDiffersFromInternalBack() {
        val state = CaptureEntryState()
        val initial = state.request
        state.beginInternalReturn()
        state.userLeaving()
        state.resumed()
        assertEquals(initial, state.request)
        state.userLeaving() // Home -> launcher/recents
        assertNotEquals(initial, state.request)
    }
    @Test fun explicitCaptureOverridesAnInternalReturn() {
        val state = CaptureEntryState()
        state.beginInternalReturn()
        val before = state.request
        state.requestCapture()
        assertNotEquals(before, state.request)
    }
    @Test fun processRestorationCanDeliverSettingsBackWithoutForcingCapture() {
        val state = CaptureEntryState()
        state.restoreInternalReturn(true, "saved-request")
        state.userLeaving()
        state.resumed()
        assertEquals("saved-request", state.request)
        assertFalse(state.internalReturn)
    }
    @Test fun anOrdinaryFreshHostDoesNotReuseThePreviousCaptureRequest() {
        val state = CaptureEntryState()
        state.restoreInternalReturn(false, "previous-host")
        assertNotEquals("previous-host", state.request)
    }
    @Test fun summaryTitleIsDerivedWithoutChangingSourceFiles() {
        val ctx = context()
        val item = recording(ctx)
        item.metaFile.writeText("immutable-source")
        val derived = item.copy(summary = "  Book the train  ")
        assertEquals("Book the train", recordingTitle(ctx, derived))
        assertEquals("immutable-source", item.metaFile.readText())
        item.metaFile.delete()
    }
    @Test fun missingOrBlankSummaryHasALocalizedDateBasedFallback() {
        val item = recording()
        assertTrue(recordingTitle(context(), item).startsWith("Recording at "))
        assertTrue(recordingTitle(context("ko"), item.copy(summary = "  ")).endsWith(" 녹음"))
    }
    @Test fun cloudOffIsNotPresentedAsAnUploadQueue() {
        val ctx = context()
        val item = recording(ctx)
        assertEquals(ctx.getString(R.string.local_only), recordingSyncLabel(ctx, item, false))
        assertEquals(ctx.getString(R.string.sync_upload_pending), recordingSyncLabel(ctx, item, true))
        assertEquals(ctx.getString(R.string.sync_attention), recordingSyncLabel(ctx, item.copy(syncStatus = "ACTION_REQUIRED"), false))
    }
    @Test fun partialDeletionReportsMissingAudioInsteadOfPretendingRollback() {
        val ctx = context()
        val item = recording(ctx)
        item.audioFile.writeText("original audio")
        item.metaFile.mkdir()
        val blocker = File(item.metaFile, "cannot-delete-nonempty-directory").apply { writeText("metadata") }
        val repo = RecordingRepository(ctx)
        try {
            assertFalse(repo.deleteRecording(item.id))
            assertFalse(item.audioFile.exists())
            assertTrue(item.metaFile.exists())
            assertEquals(ctx.getString(R.string.delete_audio_missing), localDeleteFailure(ctx, item))
        } finally { repo.close(); blocker.delete(); item.metaFile.delete() }
    }
    @Test fun failedAudioDeletionDoesNotRemoveMetadata() {
        val ctx = context()
        val item = recording(ctx)
        item.audioFile.mkdir()
        val blocker = File(item.audioFile, "still-present").apply { writeText("audio") }
        item.metaFile.writeText("source")
        val repo = RecordingRepository(ctx)
        try {
            assertFalse(repo.deleteRecording(item.id))
            assertEquals("source", item.metaFile.readText())
            assertEquals(ctx.getString(R.string.delete_failed), localDeleteFailure(ctx, item))
        } finally { repo.close(); blocker.delete(); item.audioFile.delete(); item.metaFile.delete() }
    }
    @Test fun missingAudioHasAnObservablePlaybackFailureAndNoPlayingState() {
        val player = WatchAudioPlayer(context())
        try {
            player.play(File("/does/not/exist.m4a"), "missing")
            assertEquals(WatchAudioPlayer.Failure.MISSING_AUDIO, player.error.value)
            assertFalse(player.isPlaying.value)
            assertNull(player.playingId.value)
            player.dismissError()
            assertNull(player.error.value)
        } finally { player.release() }
    }
}
