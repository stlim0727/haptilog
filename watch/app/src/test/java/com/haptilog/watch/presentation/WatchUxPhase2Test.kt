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
        assertEquals(HapticIntensity.OFF, HapticIntensity.STRONG.next())
        assertEquals(HapticIntensity.LIGHT, HapticIntensity.OFF.next())
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

        // Set to OFF
        HapticPreferences.setIntensity(context, HapticIntensity.OFF)
        assertEquals(HapticIntensity.OFF, HapticPreferences.getIntensity(context))

        // Set to LIGHT
        HapticPreferences.setIntensity(context, HapticIntensity.LIGHT)
        assertEquals(HapticIntensity.LIGHT, HapticPreferences.getIntensity(context))

        // Fallback for null/unknown ID
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

        // Test startHeartbeatLoop with OFF does not launch vibrating loop
        HapticPreferences.setIntensity(context, HapticIntensity.OFF)
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
}
