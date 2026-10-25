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
        // Robolectric does not automatically grant the merged signature permission.
        shadowOf(application).grantPermissions("${application.packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
        shadowOf(application).denyPermissions(Manifest.permission.ACCESS_FINE_LOCATION)
        shadowOf(application.getSystemService(LocationManager::class.java)).setLocationEnabled(true)
        shadowOf(application.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)
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
        assertTrue(updates.request!!.durationMillis in 1..LocationTrackingService.MAX_SESSION_MILLIS)
        service.onStartCommand(Intent(application, LocationTrackingService::class.java)
            .setAction(LocationTrackingService.ACTION_STOP), 0, 3)
        await { !LocationTrackingService.isTracking.value }
        assertTrue(updates.removals > 0)
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
        var registered: (() -> Unit)? = null
        var failed: (() -> Unit)? = null
        override fun request(request: LocationRequest, callback: LocationCallback, registered: () -> Unit, failed: () -> Unit) {
            requests++
            this.request = request
            this.registered = registered
            this.failed = failed
        }
        override fun remove(callback: LocationCallback) { removals++ }
    }

    private fun startIntent() = Intent(application, LocationTrackingService::class.java)
        .setAction(LocationTrackingService.ACTION_START)
}
