package com.haptilog.watch.sync

import android.app.Application
import android.content.Context
import androidx.work.NetworkType
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** Deferred sync coalesces sends onto the charger; the local outbox is the durability guarantee. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class SyncPolicyTest {
    private lateinit var context: Context

    @Before fun setUp() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test fun defaultsToImmediateWhenUnset() {
        assertEquals(SyncPolicy.IMMEDIATE, SyncPolicy.load(context))
        assertFalse(SyncPolicy.load(context).deferred)
    }

    @Test fun savesAndReloadsBothPolicies() {
        SyncPolicy.save(context, SyncPolicy.DEFERRED)
        assertEquals(SyncPolicy.DEFERRED, SyncPolicy.load(context))
        assertTrue(SyncPolicy.load(context).deferred)
        SyncPolicy.save(context, SyncPolicy.IMMEDIATE)
        assertEquals(SyncPolicy.IMMEDIATE, SyncPolicy.load(context))
    }

    @Test fun unknownStoredValueFallsBackToImmediate() {
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .putString("sync_policy", "POWER_SAVING").commit()
        assertEquals(SyncPolicy.IMMEDIATE, SyncPolicy.load(context))
    }

    @Test fun deferredBackgroundWorkWaitsForChargerWhileImmediateDoesNot() {
        SyncPolicy.save(context, SyncPolicy.IMMEDIATE)
        val immediate = syncConstraints(context)
        assertEquals(NetworkType.CONNECTED, immediate.requiredNetworkType)
        assertTrue(immediate.requiresBatteryNotLow())
        assertFalse(immediate.requiresCharging())

        SyncPolicy.save(context, SyncPolicy.DEFERRED)
        val deferred = syncConstraints(context)
        assertEquals(NetworkType.CONNECTED, deferred.requiredNetworkType)
        assertTrue(deferred.requiresBatteryNotLow())
        assertTrue(deferred.requiresCharging())
    }

    @Test fun foregroundFlushNeverRequiresCharging() {
        SyncPolicy.save(context, SyncPolicy.DEFERRED)
        val flush = foregroundFlushConstraints()
        assertEquals(NetworkType.CONNECTED, flush.requiredNetworkType)
        assertFalse(flush.requiresCharging())
    }
}
