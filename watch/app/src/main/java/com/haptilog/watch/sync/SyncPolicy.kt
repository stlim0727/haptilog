package com.haptilog.watch.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.NetworkType
import com.haptilog.watch.R

/**
 * Cloud upload timing. Deferred coalesces pending outbox sends onto charging or an app launch
 * instead of waking the radio the moment a recording finishes (modem tail state). Sources stay
 * durable locally either way, so deferring never risks an un-synced capture.
 */
enum class SyncPolicy(val label: Int) {
    IMMEDIATE(R.string.sync_policy_immediate),
    DEFERRED(R.string.sync_policy_deferred);

    val deferred: Boolean get() = this == DEFERRED

    companion object {
        private fun prefs(context: Context) =
            context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE)

        fun load(context: Context): SyncPolicy =
            entries.firstOrNull { it.name == prefs(context).getString("sync_policy", null) } ?: IMMEDIATE

        fun save(context: Context, policy: SyncPolicy) {
            prefs(context).edit().putString("sync_policy", policy.name).apply()
        }
    }
}

/** Background upload constraints; deferred additionally waits for the charger. */
internal fun syncConstraints(context: Context): Constraints = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .setRequiresBatteryNotLow(true)
    .apply { if (SyncPolicy.load(context).deferred) setRequiresCharging(true) }
    .build()

/** A foreground-triggered flush ignores the charger requirement: opening the app is the trigger. */
internal fun foregroundFlushConstraints(): Constraints = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .build()
