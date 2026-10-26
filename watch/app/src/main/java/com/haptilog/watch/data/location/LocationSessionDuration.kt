package com.haptilog.watch.data.location

import android.content.Context
import com.haptilog.watch.R

/** Local choice, frozen when an explicitly requested collection session starts. */
enum class LocationSessionDuration(val millis: Long?, val label: Int) {
    EIGHT_HOURS(8 * 60 * 60 * 1_000L, R.string.location_duration_eight),
    TWENTY_FOUR_HOURS(24 * 60 * 60 * 1_000L, R.string.location_duration_day),
    CONTINUOUS(null, R.string.location_duration_continuous);

    companion object {
        private const val PREFERENCES = "location_collection"
        fun load(context: Context): LocationSessionDuration {
            val value = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString("duration", null)
            return entries.firstOrNull { it.name == value } ?: EIGHT_HOURS
        }
        fun save(context: Context, duration: LocationSessionDuration) {
            check(context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit().putString("duration", duration.name).commit())
        }
    }
}
