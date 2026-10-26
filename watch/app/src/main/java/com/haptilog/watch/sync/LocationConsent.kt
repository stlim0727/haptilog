package com.haptilog.watch.sync

import android.content.Context

/** Both upload workers follow the same explicit, versioned cloud choice. */
object LocationConsent {
    internal fun preferences(context: Context) = context.getSharedPreferences("location_sync", Context.MODE_PRIVATE)
    fun enabled(context: Context): Boolean = RecordingSyncWorker.enabled(context)
}
