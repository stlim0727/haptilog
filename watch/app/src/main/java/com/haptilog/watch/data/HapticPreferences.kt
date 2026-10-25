package com.haptilog.watch.data

import android.content.Context
import android.content.SharedPreferences
import com.haptilog.watch.R

enum class HapticIntensity(val id: String, val scale: Float, val labelRes: Int) {
    OFF("off", 0.0f, R.string.haptic_intensity_off),
    LIGHT("light", 0.55f, R.string.haptic_intensity_light),
    MEDIUM("medium", 1.0f, R.string.haptic_intensity_medium),
    STRONG("strong", 1.5f, R.string.haptic_intensity_strong);

    fun next(): HapticIntensity = when (this) {
        MEDIUM -> STRONG
        STRONG -> OFF
        OFF -> LIGHT
        LIGHT -> MEDIUM
    }

    companion object {
        fun fromId(id: String?): HapticIntensity =
            values().firstOrNull { it.id == id } ?: MEDIUM
    }
}

object HapticPreferences {
    private const val PREF_NAME = "haptic_settings"
    private const val KEY_INTENSITY = "haptic_heartbeat_intensity"

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun getIntensity(context: Context): HapticIntensity {
        val id = prefs(context).getString(KEY_INTENSITY, HapticIntensity.MEDIUM.id)
        return HapticIntensity.fromId(id)
    }

    fun setIntensity(context: Context, intensity: HapticIntensity) {
        prefs(context).edit().putString(KEY_INTENSITY, intensity.id).apply()
    }
}
