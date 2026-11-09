package com.haptilog.watch.presentation

import android.app.Application
import android.content.Context
import androidx.wear.tiles.RequestBuilders
import com.haptilog.watch.data.HapticIntensity
import com.haptilog.watch.data.HapticPreferences
import com.haptilog.watch.presentation.tile.VoiceRecordTileService
import com.haptilog.watch.service.HapticHeartbeatManager
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = Application::class)
class WatchUxPhase2Test {

    private lateinit var context: Context

    @Before
    fun setup() {
        context = RuntimeEnvironment.getApplication()
    }

    @Test
    fun hapticIntensityCyclesCorrectly() {
        assertEquals(HapticIntensity.STRONG, HapticIntensity.MEDIUM.next())
        assertEquals(HapticIntensity.GENTLE, HapticIntensity.STRONG.next())
        assertEquals(HapticIntensity.LIGHT, HapticIntensity.GENTLE.next())
        assertEquals(HapticIntensity.MEDIUM, HapticIntensity.LIGHT.next())
    }

    @Test
    fun hapticPreferencesDefaultAndPersistence() {
        // Defaults to MEDIUM
        val defaultIntensity = HapticPreferences.getIntensity(context)
        assertEquals(HapticIntensity.MEDIUM, defaultIntensity)

        // Set to STRONG
        HapticPreferences.setIntensity(context, HapticIntensity.STRONG)
        assertEquals(HapticIntensity.STRONG, HapticPreferences.getIntensity(context))

        // Set to GENTLE
        HapticPreferences.setIntensity(context, HapticIntensity.GENTLE)
        assertEquals(HapticIntensity.GENTLE, HapticPreferences.getIntensity(context))

        // Set to LIGHT
        HapticPreferences.setIntensity(context, HapticIntensity.LIGHT)
        assertEquals(HapticIntensity.LIGHT, HapticPreferences.getIntensity(context))

        // Fallback for legacy "off" and null/unknown ID
        assertEquals(HapticIntensity.GENTLE, HapticIntensity.fromId("off"))
        assertEquals(HapticIntensity.MEDIUM, HapticIntensity.fromId(null))
        assertEquals(HapticIntensity.MEDIUM, HapticIntensity.fromId("unknown_xyz"))
    }

    @Test
    fun hapticHeartbeatManagerRespectsIntensity() {
        val manager = HapticHeartbeatManager(context)

        // Test preview pulse does not crash for any intensity
        for (intensity in HapticIntensity.values()) {
            manager.playPreviewPulse(intensity)
        }

        // Test startHeartbeatLoop with GENTLE
        HapticPreferences.setIntensity(context, HapticIntensity.GENTLE)
        manager.startHeartbeatLoop()
        manager.stop(cancelVibration = true)

        // Test startHeartbeatLoop with MEDIUM
        HapticPreferences.setIntensity(context, HapticIntensity.MEDIUM)
        manager.startHeartbeatLoop()
        manager.stop(cancelVibration = true)
    }

    private class TestableTileService : VoiceRecordTileService() {
        fun attach(ctx: Context) {
            attachBaseContext(ctx)
        }
    }

    @Test
    fun tileServiceBuildsTileWithDualActions() {
        val service = TestableTileService().apply { attach(context) }

        val request = RequestBuilders.TileRequest.Builder().build()
        val tile = service.onTileRequest(request).get()

        assertNotNull(tile)
        assertEquals("m3-coral-3", tile.resourcesVersion)
        assertNotNull(tile.tileTimeline)

        // Verify tile resources request returns microphone drawable mapping
        val resourceRequest = RequestBuilders.ResourcesRequest.Builder().build()
        val resources = service.onTileResourcesRequest(resourceRequest).get()

        assertNotNull(resources)
        assertEquals("m3-coral-3", resources.version)
        assertNotNull(resources.idToImageMapping["microphone"])
    }

    @Test
    fun rawLocationSyncStatusStringsDifferentiateConsentState() {
        val titleRes = context.getString(com.haptilog.watch.R.string.raw_location_title)
        val approvedRes = context.getString(com.haptilog.watch.R.string.raw_location_status_approved)
        val neededRes = context.getString(com.haptilog.watch.R.string.raw_location_status_needed)
        assertTrue(titleRes.isNotBlank())
        assertTrue(approvedRes.isNotBlank())
        assertTrue(neededRes.isNotBlank())
        assertNotEquals(approvedRes, neededRes)
    }

    @Test
    fun enlargedFontThresholdTriggersForWearOsLargeFontSetting() {
        // Wear OS default font scale is 1.0f
        assertFalse(1.0f > ENLARGED_FONT_SCALE_THRESHOLD)
        // Wear OS small font scale is 0.94f
        assertFalse(0.94f > ENLARGED_FONT_SCALE_THRESHOLD)

        // Wear OS medium/large font scale settings (1.12f, 1.15f, 1.24f, 1.30f)
        assertTrue(1.12f > ENLARGED_FONT_SCALE_THRESHOLD)
        assertTrue(1.15f > ENLARGED_FONT_SCALE_THRESHOLD)
        assertTrue(1.24f > ENLARGED_FONT_SCALE_THRESHOLD)
        assertTrue(1.30f > ENLARGED_FONT_SCALE_THRESHOLD)
        assertTrue(2.0f > ENLARGED_FONT_SCALE_THRESHOLD)
    }

    @Test
    fun recordingsListPaddingGuaranteesRoundScreenClearance() {
        // Wear OS round screens require bottom padding >= 48dp so the last card doesn't clip against curved bezel
        assertTrue(RECORDINGS_LIST_BOTTOM_PADDING.value >= 48f)
        // Top padding must clear TimeText and the curved top bezel
        assertTrue(RECORDINGS_LIST_TOP_PADDING.value >= 36f)
        assertTrue(RECORDINGS_LIST_TOP_EXPANDED_PADDING.value >= 40f)
        assertTrue(RECORDINGS_LIST_SIDE_PADDING.value >= 16f)
    }
}
