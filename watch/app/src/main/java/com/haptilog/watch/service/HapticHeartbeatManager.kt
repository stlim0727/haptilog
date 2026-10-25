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
     * Start feedback: 1 crisp mechanical shutter click (Amp 1.0f)
     * giving immediate eyes-free confidence that recording has begun.
     */
    fun playStartFeedback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK) == true) {
            val effect = VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 1.0f)
                .compose()
            vibrator.vibrate(effect)
        } else {
            val effect = VibrationEffect.createOneShot(35, 200)
            vibrator?.vibrate(effect)
        }
    }

    /**
     * Pause feedback: 2 gentle discrete ticks confirming recording has paused.
     */
    fun playPauseFeedback() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_TICK) == true) {
            val effect = VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.45f)
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.45f, 70)
                .compose()
            vibrator.vibrate(effect)
        } else {
            val timings = longArrayOf(0, 25, 45, 25)
            val amplitudes = intArrayOf(0, 80, 0, 80)
            vibrator?.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
        }
    }

    /**
     * Stop & Seal feedback: "딸깍" mechanical closure.
     * Initial acknowledgment click (0.7f) followed 80ms later by a decisive
     * sealing click (1.0f) confirming recording is safely committed to disk.
     */
    fun playStopFeedback() {
        heartbeatJob?.cancel()
        heartbeatJob = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK) == true) {
            val composition = VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.7f)
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 1.0f, 80)
            vibrator?.vibrate(composition.compose())
        } else {
            val timings = longArrayOf(0, 30, 70, 45)
            val amplitudes = intArrayOf(0, 140, 0, 220)
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator?.vibrate(effect)
        }
    }

    /**
     * Living Pulse loop: 1.2s interval (~50 bpm resting physiological cadence).
     * Eliminates the pathological 2.4s (25 bpm) bradycardia.
     * Uses PRIMITIVE_LOW_TICK to stimulate wrist Pacinian corpuscles without
     * high-frequency chassis vibration leaking into the microphone.
     */
    fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            val supportsLowTick = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_LOW_TICK) == true
            val supportsTick = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_TICK) == true

            val pulseEffect = when {
                supportsLowTick -> VibrationEffect.startComposition()
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_LOW_TICK, 0.45f)
                    .compose()
                supportsTick -> VibrationEffect.startComposition()
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.35f)
                    .compose()
                else -> {
                    // Subtle waveform: short duration, low acoustic signature
                    val timings = longArrayOf(0, 25, 40, 20)
                    val amplitudes = intArrayOf(0, 50, 0, 35)
                    VibrationEffect.createWaveform(timings, amplitudes, -1)
                }
            }

            while (isActive) {
                delay(1200) // 1.2s cadence (~50 bpm natural resting pulse)
                if (isActive) {
                    vibrator?.vibrate(pulseEffect)
                }
            }
        }
    }

    /**
     * Timeout Warning: 3 gentle consecutive taps 30 seconds before auto-cutoff (at 150s of 180s).
     * Whispers to the user's wrist that the recording window will soon close.
     */
    fun playTimeoutWarningFeedback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_TICK) == true) {
            val effect = VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.5f)
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.5f, 60)
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.7f, 60)
                .compose()
            vibrator?.vibrate(effect)
        } else {
            val timings = longArrayOf(0, 25, 60, 25, 60, 35)
            val amplitudes = intArrayOf(0, 100, 0, 100, 0, 140)
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator?.vibrate(effect)
        }
    }

    /**
     * Failure / Interrupted feedback: A soft decaying rumble instead of a jarring screech.
     */
    fun playFailureFeedback() {
        val timings = longArrayOf(0, 60, 40, 80)
        val amplitudes = intArrayOf(0, 110, 0, 60)
        val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
        vibrator?.vibrate(effect)
    }

    fun stop(cancelVibration: Boolean = true) {
        heartbeatJob?.cancel()
        heartbeatJob = null
        if (cancelVibration) vibrator?.cancel()
    }
}
