package com.haptilog.watch.service

import android.annotation.SuppressLint
import android.content.Context
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices

/** Small provider boundary so lifecycle tests never depend on installed Google Play Services. */
internal interface JournalLocationUpdates {
    fun request(request: LocationRequest, callback: LocationCallback, registered: () -> Unit, failed: () -> Unit)
    fun remove(callback: LocationCallback)
    fun getLastLocation(onLocation: (android.location.Location?) -> Unit) { onLocation(null) }
}

internal class FusedJournalLocationUpdates(context: Context) : JournalLocationUpdates {
    private val client = LocationServices.getFusedLocationProviderClient(context)

    @SuppressLint("MissingPermission")
    override fun request(request: LocationRequest, callback: LocationCallback, registered: () -> Unit, failed: () -> Unit) {
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
            .addOnSuccessListener { registered() }
            .addOnFailureListener { failed() }
    }

    override fun remove(callback: LocationCallback) {
        client.removeLocationUpdates(callback)
    }

    @SuppressLint("MissingPermission")
    override fun getLastLocation(onLocation: (android.location.Location?) -> Unit) {
        client.lastLocation
            .addOnSuccessListener { onLocation(it) }
            .addOnFailureListener { onLocation(null) }
    }
}
