package com.haptilog.watch.service

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.app.Service
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.LocationManager
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.haptilog.watch.data.location.LocationHistoryRepository
import com.haptilog.watch.data.location.LocationStayEndReason
import com.haptilog.watch.data.location.LocationCollection
import com.haptilog.watch.data.location.LocationSample
import com.haptilog.watch.R
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30, 34], application = Application::class)
class LocationTrackingServiceTest {
    private lateinit var application: Application
    private lateinit var updates: FakeUpdates

    @Before fun setUp() {
        application = RuntimeEnvironment.getApplication()
        updates = FakeUpdates()
        application.getSharedPreferences("location_collection", android.content.Context.MODE_PRIVATE).edit().clear().commit()
        application.getSharedPreferences("cloud_options", android.content.Context.MODE_PRIVATE).edit().clear().commit()
        LocationCollection.save(application, LocationCollection.INCLUDING_NON_RECORDING)
        // The WorkManager singleton can survive between Robolectric SDK variants.
        // Initialize only when the test application has no instance yet.
        try { androidx.work.WorkManager.getInstance(application) }
        catch (_: IllegalStateException) {
            androidx.work.WorkManager.initialize(application, androidx.work.Configuration.Builder().build())
        }
        // The repository singleton also survives SDK test variants. Each scenario starts
        // with local defaults, not a prior scenario's downloaded 20-minute threshold.
        application.getSharedPreferences("location_sync", android.content.Context.MODE_PRIVATE)
            .edit().clear().commit()
        LocationHistoryRepository.get(application).apply {
            stopSession()
            clearHistory()
            setDwellMinutes(10)
            state.value.places.forEach { removePlace(it.id) }
        }
        // Robolectric does not automatically grant the merged signature permission.
        shadowOf(application).grantPermissions("${application.packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
        shadowOf(application).denyPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        shadowOf(application.getSystemService(LocationManager::class.java)).setLocationEnabled(true)
        shadowOf(application.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)
    }

    @Test fun collectionScopeAndCloudChoiceHaveSixIndependentCombinations() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        for (scope in LocationCollection.entries) for (cloud in listOf(false, true)) {
            application.getSharedPreferences("cloud_options", android.content.Context.MODE_PRIVATE).edit()
                .putBoolean("enabled", cloud).putString("consent_version", com.haptilog.watch.sync.CloudConsent.VERSION).commit()
            LocationCollection.save(application, scope)
            updates = FakeUpdates()
            val controller = controller()
            val service = controller.get()
            service.onStartCommand(startIntent(), 0, 1)
            if (scope == LocationCollection.INCLUDING_NON_RECORDING) {
                await { updates.requests == 1 }
                assertTrue(LocationTrackingService.isTracking.value)
                service.onStartCommand(Intent(application, LocationTrackingService::class.java)
                    .setAction(LocationTrackingService.ACTION_STOP), 0, 2)
                await { !LocationTrackingService.isTracking.value }
            } else {
                assertFalse(LocationTrackingService.isTracking.value)
                assertEquals(0, updates.requests)
            }
            assertEquals(cloud, com.haptilog.watch.sync.RecordingSyncWorker.enabled(application))
            controller.destroy()
        }
    }

    @Test fun alwaysScopeResumesCollectionWhenAScreenOpens() {
        for (scope in listOf(LocationCollection.OFF, LocationCollection.RECORDING_ONLY)) {
            LocationCollection.save(application, scope)
            LocationTrackingService.ensureAlwaysSession(application)
            assertNull(shadowOf(application).peekNextStartedService())
        }
        LocationCollection.save(application, LocationCollection.INCLUDING_NON_RECORDING)
        LocationTrackingService.ensureAlwaysSession(application)
        val intent = shadowOf(application).peekNextStartedService()
        assertEquals(LocationTrackingService::class.java.name, intent?.component?.className)
        assertEquals(LocationTrackingService.ACTION_START, intent?.action)
    }

    @Test fun runningAlwaysSessionIsNotStartedAgainOnScreenEntry() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val controller = controller()
        controller.get().onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        LocationTrackingService.ensureAlwaysSession(application)
        LocationTrackingService.ensureAlwaysSession(application)
        assertNull(shadowOf(application).peekNextStartedService())
        assertEquals(1, updates.requests)
        controller.get().onStartCommand(Intent(application, LocationTrackingService::class.java)
            .setAction(LocationTrackingService.ACTION_STOP), 0, 2)
        await { !LocationTrackingService.isTracking.value }
        controller.destroy()
    }

    @Test fun permissionDeniedDoesNotStartOrRestartTracking() {
        val controller = controller()
        val service = controller.get()
        assertEquals(Service.START_NOT_STICKY, service.onStartCommand(startIntent(), 0, 1))
        assertFalse(LocationTrackingService.isTracking.value)
        assertEquals(application.getString(R.string.location_service_permission_required), LocationTrackingService.status.value)
        assertTrue(shadowOf(service).isStoppedBySelf)
        controller.destroy()
    }

    @Test fun approximatePermissionAloneCannotStartPlaceTracking() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_COARSE_LOCATION)
        val controller = controller()
        controller.get().onStartCommand(startIntent(), 0, 1)
        assertFalse(LocationTrackingService.isTracking.value)
        assertEquals(application.getString(R.string.location_service_permission_required), LocationTrackingService.status.value)
        controller.destroy()
    }

    @Test fun disabledDeviceLocationDoesNotStartTracking() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        shadowOf(application.getSystemService(LocationManager::class.java)).setLocationEnabled(false)
        val controller = controller()
        controller.get().onStartCommand(startIntent(), 0, 1)
        assertFalse(LocationTrackingService.isTracking.value)
        assertEquals(application.getString(R.string.location_service_disabled), LocationTrackingService.status.value)
        controller.destroy()
    }

    @Test fun hiddenNotificationsPreventTracking() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        shadowOf(application.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)
        val controller = controller()
        controller.get().onStartCommand(startIntent(), 0, 1)
        assertFalse(LocationTrackingService.isTracking.value)
        assertEquals(application.getString(R.string.location_service_notifications_required), LocationTrackingService.status.value)
        controller.destroy()
    }

    @Test fun nullRestartIntentNeverStartsTracking() {
        val controller = controller()
        val service = controller.get()
        assertEquals(Service.START_NOT_STICKY, service.onStartCommand(null, 0, 1))
        assertFalse(LocationTrackingService.isTracking.value)
        assertTrue(shadowOf(service).isStoppedBySelf)
        controller.destroy()
    }

    @Test fun serviceIsPrivateAndOnlyUsesLocationForegroundType() {
        val info = application.packageManager.getServiceInfo(
            ComponentName(application, LocationTrackingService::class.java), 0,
        )
        assertFalse(info.exported)
        assertEquals(ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION, info.foregroundServiceType)
        val permissions = application.packageManager.getPackageInfo(
            application.packageName, PackageManager.GET_PERMISSIONS,
        ).requestedPermissions.orEmpty()
        assertFalse(permissions.contains(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
    }

    @Test fun explicitSessionRegistersOnceAndStopsWithoutLosingHistory() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val controller = controller()
        val service = controller.get()
        service.onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        assertTrue(LocationTrackingService.isTracking.value)
        assertNotNull(shadowOf(service).lastForegroundNotification)
        service.onStartCommand(startIntent(), 0, 2)
        assertEquals(1, updates.requests)
        assertEquals(Long.MAX_VALUE, updates.request!!.durationMillis)
        service.onStartCommand(Intent(application, LocationTrackingService::class.java)
            .setAction(LocationTrackingService.ACTION_STOP), 0, 3)
        await { !LocationTrackingService.isTracking.value }
        assertTrue(updates.removals > 0)
        assertEquals(LocationCollection.RECORDING_ONLY, LocationCollection.load(application))
        // Stopped is published only after the repository permits edits again.
        LocationHistoryRepository.get(application).setDwellMinutes(10)
        assertTrue(shadowOf(service).isStoppedBySelf)
        controller.destroy()
    }

    @Test fun destructionDrainsSessionAndLateRegistrationIsRemoved() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val controller = controller()
        controller.get().onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        controller.destroy()
        await { !LocationTrackingService.isTracking.value }
        val removals = updates.removals
        updates.registered!!.invoke()
        assertTrue(updates.removals > removals)
        LocationHistoryRepository.get(application).setDwellMinutes(10)
    }

    @Test fun providerFailureStopsVisibleSession() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val controller = controller()
        controller.get().onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        updates.failed!!.invoke()
        await { !LocationTrackingService.isTracking.value }
        assertEquals(application.getString(R.string.location_service_provider_error), LocationTrackingService.status.value)
        controller.destroy()
    }

    @Test fun explicitStopPersistsStayWithUserStopReason() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val controller = controller()
        val service = controller.get()
        service.onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        val repository = LocationHistoryRepository.get(application)
        // Inject already validated session-time observations without waiting five real minutes.
        val elapsedStart = android.os.SystemClock.elapsedRealtime()
        val wallStart = System.currentTimeMillis()
        for (seconds in 0L..600 step 60) {
            val elapsed = elapsedStart + seconds * 1000
            repository.recordSample(LocationSample(37.0, 127.0, 10f,
                wallStart + seconds * 1000, elapsed), elapsed)
        }
        val activeId = repository.state.value.stays.last().id
        service.onStartCommand(Intent(application, LocationTrackingService::class.java)
            .setAction(LocationTrackingService.ACTION_STOP), 0, 2)
        await { !LocationTrackingService.isTracking.value }
        val closed = repository.state.value.stays.single { it.id == activeId }
        assertEquals(LocationStayEndReason.USER_STOP, closed.endReason)
        assertEquals(600_000L, closed.observedDurationMillis)
        controller.destroy()
    }

    @Test fun downloadedSettingsApplyBeforeNextSessionAndRecordAppliedRevision() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val prefs = application.getSharedPreferences("location_sync", android.content.Context.MODE_PRIVATE)
        application.getSharedPreferences("cloud_options", android.content.Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", true).putString("consent_version", com.haptilog.watch.sync.CloudConsent.VERSION).commit()
        prefs.edit()
            .putString("pending_places", org.json.JSONObject().put("revision", 11).put("owner_user_id", "owner")
                .put("threshold_minutes", 20).put("places", org.json.JSONArray().put(org.json.JSONObject()
                    .put("id", "33333333-3333-4333-8333-333333333333").put("name", "Office")
                    .put("latitude", 37.0).put("longitude", 127.0).put("radius_meters", 200))).toString())
            .commit()
        val controller = controller()
        val service = controller.get()
        service.onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        val repository = LocationHistoryRepository.get(application)
        assertEquals(20, repository.state.value.dwellMinutes)
        assertEquals("Office", repository.state.value.places.single().name)
        assertEquals(11L, prefs.getLong("applied_places_revision", -1))
        service.onStartCommand(Intent(application, LocationTrackingService::class.java)
            .setAction(LocationTrackingService.ACTION_STOP), 0, 2)
        await { !LocationTrackingService.isTracking.value }
        controller.destroy()
    }

    @Test fun revokedConsentDoesNotApplyDownloadedSettingsAtNextStart() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val prefs = application.getSharedPreferences("location_sync", android.content.Context.MODE_PRIVATE)
        prefs.edit().putBoolean("enabled", false)
            .putString("pending_places", "not valid JSON").commit()
        val controller = controller()
        controller.get().onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        assertEquals(-1L, prefs.getLong("applied_places_revision", -1))
        controller.get().onStartCommand(Intent(application, LocationTrackingService::class.java)
            .setAction(LocationTrackingService.ACTION_STOP), 0, 2)
        await { !LocationTrackingService.isTracking.value }
        controller.destroy()
    }

    @Test fun continuousHasNoProviderLimitAndCanBeStoppedAfterMultipleDays() {
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        val controller = controller()
        val service = controller.get()
        service.onStartCommand(startIntent(), 0, 1)
        await { updates.requests == 1 }
        assertEquals(Long.MAX_VALUE, updates.request!!.durationMillis)
        org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofDays(2))
        updates.callback!!.onLocationResult(com.google.android.gms.location.LocationResult.create(emptyList()))
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(LocationTrackingService.isTracking.value)
        service.onStartCommand(Intent(application, LocationTrackingService::class.java)
            .setAction(LocationTrackingService.ACTION_STOP), 0, 2)
        await { !LocationTrackingService.isTracking.value }
        assertTrue(updates.removals > 0)
        controller.destroy()
    }

    private fun controller() = Robolectric.buildService(LocationTrackingService::class.java).apply {
        get().locationUpdates = updates
        create()
    }

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000L
        while (!condition() && System.nanoTime() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(10)
        }
        assertTrue("Asynchronous service operation did not finish", condition())
    }

    private class FakeUpdates : JournalLocationUpdates {
        var requests = 0
        var removals = 0
        var request: LocationRequest? = null
        var callback: LocationCallback? = null
        var registered: (() -> Unit)? = null
        var failed: (() -> Unit)? = null
        override fun request(request: LocationRequest, callback: LocationCallback, registered: () -> Unit, failed: () -> Unit) {
            requests++
            this.request = request
            this.callback = callback
            this.registered = registered
            this.failed = failed
        }
        override fun remove(callback: LocationCallback) { removals++ }
    }

    private fun startIntent() = Intent(application, LocationTrackingService::class.java)
        .setAction(LocationTrackingService.ACTION_START)
}
