package com.haptilog.watch.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
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

    @SuppressLint("MissingPermission")
    suspend fun getFastLocationSnapshot(): LocationSnapshot? {
        if (!hasLocationPermission()) return null

        // 1. Try immediate cached lastLocation
        try {
            val lastLoc = fusedClient.lastLocation.await()
            if (lastLoc != null) {
                return lastLoc.toSnapshot()
            }
        } catch (_: Exception) {
            // Fall through to current location
        }

        // 2. Request current fresh location
        return try {
            val cts = CancellationTokenSource()
            val freshLoc = fusedClient.getCurrentLocation(
                Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                cts.token
            ).await()
            freshLoc?.toSnapshot()
        } catch (_: Exception) {
            null
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
