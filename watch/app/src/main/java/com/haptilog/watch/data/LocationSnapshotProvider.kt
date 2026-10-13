package com.haptilog.watch.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.SystemClock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.CancellationException
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await

data class LocationSnapshot(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val speed: Float,
    val accuracy: Float,
    val timestamp: Long
)

class LocationSnapshotProvider(context: Context) {

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context.applicationContext)
    private val appContext = context.applicationContext

    fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    fun isLocationEnabled(): Boolean =
        (appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled

    @SuppressLint("MissingPermission")
    suspend fun capture(onSnapshot: (LocationSnapshot) -> Unit) {
        if (!hasLocationPermission() || !isLocationEnabled()) return
        try {
            withTimeoutOrNull(1000) {
                fusedClient.lastLocation.await()?.takeIf {
                    SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos <= 120_000_000_000L
                }?.let { onSnapshot(it.toSnapshot()) }
            }
            val cts = CancellationTokenSource()
            try {
                withTimeoutOrNull(15_000) {
                    fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                        .await()?.let { onSnapshot(it.toSnapshot()) }
                }
            } finally {
                cts.cancel()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Location is optional; a failure must not interrupt capture.
        }
    }

    private fun Location.toSnapshot(): LocationSnapshot {
        return LocationSnapshot(
            latitude = latitude,
            longitude = longitude,
            altitude = altitude,
            speed = speed,
            accuracy = accuracy,
            timestamp = time
        )
    }
}
