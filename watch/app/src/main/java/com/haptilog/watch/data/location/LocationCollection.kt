package com.haptilog.watch.data.location

import android.content.Context
import com.haptilog.watch.R

/** Collection scope is local to this watch; cloud consent never starts collection. */
enum class LocationCollection(val label: Int) {
    OFF(R.string.location_scope_off),
    RECORDING_ONLY(R.string.location_scope_recording),
    INCLUDING_NON_RECORDING(R.string.location_scope_also);

    val includesRecordings: Boolean get() = this != OFF

    companion object {
        fun load(context: Context): LocationCollection {
            val value = context.getSharedPreferences("location_collection", Context.MODE_PRIVATE)
                .getString("scope", null)
            return entries.firstOrNull { it.name == value } ?: RECORDING_ONLY
        }
        fun save(context: Context, scope: LocationCollection) {
            check(context.getSharedPreferences("location_collection", Context.MODE_PRIVATE).edit()
                .putString("scope", scope.name).remove("duration").commit())
        }
    }
}
