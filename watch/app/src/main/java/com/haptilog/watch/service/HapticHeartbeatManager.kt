package com.haptilog.watch.service

import android.content.Context
import android.os.Build
import android.os.CombinedVibration
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Manages eyes-free haptic feedback for voice recording.
 * Provides subtle heartbeat pulsing during active recording without
 * producing loud chassis noise that leaks into the microphone.
 */
class HapticHeartbeatManager(private val context: Context) {

    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    private var heartbeatJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    /**
     * Start feedback: 1 crisp click to acknowledge recording initiation.
     */
    fun playStartFeedback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK) == true) {
            val effect = VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.8f)
                .compose()
            vibrator.vibrate(effect)
        } else {
            val effect = VibrationEffect.createOneShot(50, 150)
            vibrator?.vibrate(effect)
        }
    }

    /**
     * Stop feedback: 2 quick ticks to confirm recording stopped and saved.
     */
    fun playStopFeedback() {
        heartbeatJob?.cancel()
        heartbeatJob = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK) == true) {
            val effect = VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.7f)
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.9f, 100)
                .compose()
            vibrator?.vibrate(effect)
        } else {
            val timings = longArrayOf(0, 40, 80, 50)
            val amplitudes = intArrayOf(0, 140, 0, 180)
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator?.vibrate(effect)
        }
    }

    /**
     * Starts the periodic heartbeat haptic loop (쿵-쾅 ... 쿵-쾅).
     * Amplitude is calibrated low (40~70) to prevent acoustic interference with the mic.
     */
    fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            // Heartbeat timings: [Wait, Lub, Rest, Dub]
            val timings = longArrayOf(0, 35, 70, 45)
            val amplitudes = intArrayOf(0, 55, 0, 40) // Subtle amplitude
            val pulseEffect = VibrationEffect.createWaveform(timings, amplitudes, -1)

            while (isActive) {
                delay(2400) // 2.4s interval between heartbeat double-beats
                if (isActive) {
                    vibrator?.vibrate(pulseEffect)
                }
            }
        }
    }

    fun playFailureFeedback() {
        vibrator?.vibrate(VibrationEffect.createOneShot(300, 100))
    }

    fun stop(cancelVibration: Boolean = true) {
        heartbeatJob?.cancel()
        heartbeatJob = null
        if (cancelVibration) vibrator?.cancel()
    }
}
