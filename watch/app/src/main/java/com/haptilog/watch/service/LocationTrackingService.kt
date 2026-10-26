package com.haptilog.watch.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.Priority
import com.haptilog.watch.R
import com.haptilog.watch.data.location.LocationHistoryRepository
import com.haptilog.watch.data.location.LocationStayEndReason
import com.haptilog.watch.data.location.LocationSample
import com.haptilog.watch.presentation.LocationJournalActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** A visible, explicitly started location session, independent of microphone capture. */
class LocationTrackingService : Service() {
    companion object {
        const val ACTION_START = "com.haptilog.watch.action.LOCATION_START"
        const val ACTION_STOP = "com.haptilog.watch.action.LOCATION_STOP"
        const val MAX_SESSION_MILLIS = 8 * 60 * 60 * 1_000L
        private const val CHANNEL_ID = "haptilog_location_journal"
        private const val NOTIFICATION_ID = 1002
        private val mutableIsTracking = MutableStateFlow(false)
        val isTracking: StateFlow<Boolean> = mutableIsTracking
        private val mutableStatus = MutableStateFlow<String?>(null)
        val status: StateFlow<String?> = mutableStatus
        // Accessed only on Main. A destroyed service may still be draining disk writes.
        private var owner: LocationTrackingService? = null
    }

    private sealed interface Write {
        data class Start(val sessionStartElapsedMillis: Long) : Write
        data class Samples(val locations: List<Location>) : Write
        data class InitialFix(val location: Location) : Write
        data class Stop(val reason: LocationStayEndReason) : Write
        data class Expire(val elapsedMillis: Long, val wallMillis: Long) : Write
    }

    internal var locationUpdates: JournalLocationUpdates? = null
    private lateinit var repository: LocationHistoryRepository
    private val mainScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val writeScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    // At a one-minute interval even delayed batches are small. Serial writes also ensure
    // a stop cannot overtake an already accepted location or the session initialization.
    private val writes = Channel<Write>(Channel.UNLIMITED)
    private var started = false
    private var stopping = false
    private var receiverRegistered = false
    private var sessionDeadline = 0L

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            if (!started || stopping) return
            if (SystemClock.elapsedRealtime() >= sessionDeadline) {
                stopTracking(getString(R.string.location_service_timeout), LocationStayEndReason.SESSION_TIMEOUT)
            } else writes.trySend(Write.Samples(result.locations))
        }
    }

    private val providerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (started && !isLocationEnabled()) stopTracking(getString(R.string.location_service_disabled), LocationStayEndReason.LOCATION_DISABLED)
        }
    }

    override fun onCreate() {
        super.onCreate()
        if (locationUpdates == null) locationUpdates = FusedJournalLocationUpdates(applicationContext)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.location_service_channel),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = getString(R.string.location_service_channel_description) },
        )
        ContextCompat.registerReceiver(
            this, providerReceiver, IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        receiverRegistered = true
        writeScope.launch {
            try {
                for (write in writes) {
                    try {
                        when (write) {
                            is Write.Start -> {
                                repository = LocationHistoryRepository.get(applicationContext)
                                repository.startSession(write.sessionStartElapsedMillis)
                                withContext(Dispatchers.Main.immediate) {
                                    if (started && !stopping) {
                                        requestLocationUpdates()
                                        fetchInitialLocation()
                                    }
                                }
                            }
                            is Write.InitialFix -> {
                                val location = write.location
                                val sample = LocationSample(
                                    latitude = location.latitude,
                                    longitude = location.longitude,
                                    accuracyMeters = if (location.hasAccuracy()) location.accuracy else Float.NaN,
                                    timestampMillis = location.time,
                                    elapsedRealtimeMillis = location.elapsedRealtimeNanos / 1_000_000L,
                                )
                                repository.setInitialFix(sample)
                            }
                            is Write.Samples -> write.locations.forEach { location ->
                                // Monotonic timestamps reject stale cached/batched fixes even
                                // when the device wall clock changes during a session.
                                repository.recordSample(
                                    LocationSample(
                                        latitude = location.latitude,
                                        longitude = location.longitude,
                                        accuracyMeters = if (location.hasAccuracy()) location.accuracy else Float.NaN,
                                        timestampMillis = location.time,
                                        elapsedRealtimeMillis = location.elapsedRealtimeNanos / 1_000_000L,
                                    ),
                                    nowElapsedRealtimeMillis = SystemClock.elapsedRealtime(),
                                )
                            }
                            is Write.Expire -> repository.expireStay(write.elapsedMillis, write.wallMillis)
                            is Write.Stop -> {
                                try {
                                    if (::repository.isInitialized) repository.stopSession(write.reason, System.currentTimeMillis())
                                } finally {
                                    withContext(Dispatchers.Main.immediate) { finishStop() }
                                }
                            }
                        }
                    } catch (_: Exception) {
                        withContext(Dispatchers.Main.immediate) {
                            stopTracking(getString(R.string.location_service_storage_error), LocationStayEndReason.STORAGE_ERROR)
                        }
                    }
                }
            } finally {
                writeScope.cancel()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startTracking()
            ACTION_STOP -> stopTracking()
            else -> if (!started) stopSelf()
        }
        // Never resume location tracking after a process kill, reboot, or an OS restart.
        return START_NOT_STICKY
    }

    private fun startTracking() {
        if (started || stopping) return
        if (owner != null && owner !== this) {
            stopSelf()
            return
        }
        if (!hasPreciseLocationPermission()) {
            stopTracking(getString(R.string.location_service_permission_required), LocationStayEndReason.PERMISSION_LOST)
            return
        }
        if (!isLocationEnabled()) {
            stopTracking(getString(R.string.location_service_disabled), LocationStayEndReason.LOCATION_DISABLED)
            return
        }
        if (!notificationsEnabled()) {
            stopTracking(getString(R.string.location_service_notifications_required), LocationStayEndReason.NOTIFICATIONS_DISABLED)
            return
        }
        try {
            startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } catch (_: RuntimeException) {
            stopTracking(getString(R.string.location_service_start_error), LocationStayEndReason.PROVIDER_ERROR)
            return
        }
        started = true
        owner = this
        mutableIsTracking.value = true
        mutableStatus.value = null
        val sessionStartElapsed = SystemClock.elapsedRealtime()
        sessionDeadline = sessionStartElapsed + MAX_SESSION_MILLIS
        writes.trySend(Write.Start(sessionStartElapsed))
        mainScope.launch {
            while (started && !stopping) {
                delay(30_000L)
                if (started && !stopping) writes.trySend(Write.Expire(SystemClock.elapsedRealtime(), System.currentTimeMillis()))
                when {
                    !hasPreciseLocationPermission() -> stopTracking(getString(R.string.location_service_permission_required), LocationStayEndReason.PERMISSION_LOST)
                    !isLocationEnabled() -> stopTracking(getString(R.string.location_service_disabled), LocationStayEndReason.LOCATION_DISABLED)
                    !notificationsEnabled() -> stopTracking(getString(R.string.location_service_notifications_required), LocationStayEndReason.NOTIFICATIONS_DISABLED)
                    SystemClock.elapsedRealtime() >= sessionDeadline ->
                        stopTracking(getString(R.string.location_service_timeout), LocationStayEndReason.SESSION_TIMEOUT)
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun fetchInitialLocation() {
        if (!hasPreciseLocationPermission()) return
        locationUpdates?.getLastLocation { location ->
            if (started && !stopping && location != null) {
                writes.trySend(Write.InitialFix(location))
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun requestLocationUpdates() {
        if (!started || stopping) return
        if (!hasPreciseLocationPermission()) {
            stopTracking(getString(R.string.location_service_permission_required), LocationStayEndReason.PERMISSION_LOST)
            return
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 60_000L)
            .setMinUpdateIntervalMillis(30_000L)
            .setMaxUpdateAgeMillis(0L)
            .setDurationMillis((sessionDeadline - SystemClock.elapsedRealtime()).coerceAtLeast(1))
            .build()
        try {
            locationUpdates!!.request(request, locationCallback, registered = {
                    // Stop may race the asynchronous registration; remove it again when
                    // registration succeeds after cleanup.
                    if (!started || stopping) removeLocationUpdates()
                }, failed = {
                    if (started && !stopping) stopTracking(getString(R.string.location_service_provider_error), LocationStayEndReason.PROVIDER_ERROR)
                })
        } catch (_: RuntimeException) {
            stopTracking(getString(R.string.location_service_provider_error), LocationStayEndReason.PROVIDER_ERROR)
        }
    }

    private fun stopTracking(message: String? = null, reason: LocationStayEndReason = LocationStayEndReason.USER_STOP) {
        if (message != null) mutableStatus.value = message
        if (stopping) return
        stopping = true
        val needsDrain = started
        if (needsDrain) writes.trySend(Write.Stop(reason))
        started = false
        removeLocationUpdates()
        mainScope.cancel()
        if (!needsDrain) finishStop()
    }

    private fun finishStop() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        if (owner === this) {
            owner = null
            mutableIsTracking.value = false
        }
    }

    private fun removeLocationUpdates() {
        runCatching { locationUpdates?.remove(locationCallback) }
    }

    private fun hasPreciseLocationPermission(): Boolean = ContextCompat.checkSelfPermission(
        this, Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED

    private fun isLocationEnabled(): Boolean =
        getSystemService(LocationManager::class.java).isLocationEnabled

    private fun notificationsEnabled(): Boolean =
        NotificationManagerCompat.from(this).areNotificationsEnabled() &&
            getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL_ID)
                ?.importance != NotificationManager.IMPORTANCE_NONE

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(
            this, NOTIFICATION_ID, Intent(this, LocationJournalActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this, NOTIFICATION_ID, Intent(this, LocationTrackingService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(R.string.location_service_title))
            .setContentText(getString(R.string.location_service_body))
            .setContentIntent(open)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_media_pause, getString(R.string.location_service_stop), stop)
            .build()
    }

    override fun onDestroy() {
        if (started) writes.trySend(Write.Stop(LocationStayEndReason.SERVICE_DESTROYED))
        started = false
        stopping = true
        removeLocationUpdates()
        mainScope.cancel()
        // Drain already queued disk writes; do not cancel a pending atomic commit.
        writes.close()
        if (receiverRegistered) unregisterReceiver(providerReceiver)
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
