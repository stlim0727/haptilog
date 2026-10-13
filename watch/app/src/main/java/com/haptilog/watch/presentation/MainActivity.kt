package com.haptilog.watch.presentation

import android.annotation.SuppressLint
import android.os.Build
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.core.content.ContextCompat
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.haptilog.watch.service.VoiceRecordingService

class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_TOGGLE = "toggle_recording"
    }

    private var pendingToggle = false
    // This activity extends ComponentActivity and does not use FragmentActivity.
    @SuppressLint("InvalidFragmentVersionForActivityResult")
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (pendingToggle && permissions[Manifest.permission.RECORD_AUDIO] == true) {
            sendToggle()
        } else if (pendingToggle) {
            Toast.makeText(this, "Microphone permission is needed to record", Toast.LENGTH_LONG).show()
        }
        pendingToggle = false
    }

    private fun sendToggle() {
        val serviceIntent = Intent(this, VoiceRecordingService::class.java).apply {
            action = VoiceRecordingService.ACTION_TOGGLE
        }
        if (VoiceRecordingService.isRecording.value) startService(serviceIntent)
        else ContextCompat.startForegroundService(this, serviceIntent)
    }

    private fun toggleRecording() {
        if (VoiceRecordingService.isRecording.value ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            sendToggle()
        } else {
            pendingToggle = true
            val permissions = mutableListOf(
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("pending_toggle", pendingToggle)
        super.onSaveInstanceState(outState)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingToggle = savedInstanceState?.getBoolean("pending_toggle") ?: false
        if (savedInstanceState == null && intent.getBooleanExtra(EXTRA_TOGGLE, false)) {
            intent.removeExtra(EXTRA_TOGGLE)
            toggleRecording()
        }

        setContent {
            MaterialTheme {
                val isRecording by VoiceRecordingService.isRecording.collectAsState()

                RecordingScreen(
                    isRecording = isRecording,
                    onToggleRecording = ::toggleRecording
                )
            }
        }
    }
}

@Composable
fun RecordingScreen(
    isRecording: Boolean,
    onToggleRecording: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        // Outer pulsing ring when recording
        if (isRecording) {
            Box(
                modifier = Modifier
                    .size(140.dp)
                    .scale(pulseScale)
                    .background(Color(0xFFE53935).copy(alpha = 0.35f), CircleShape)
            )
        }

        // Main Action Button
        Button(
            onClick = onToggleRecording,
            modifier = Modifier.size(110.dp),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                backgroundColor = if (isRecording) Color(0xFFD32F2F) else Color(0xFF1976D2)
            )
        ) {
            Text(
                text = if (isRecording) "STOP" else "RECORD",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }
    }
}
