package com.haptilog.watch.presentation

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

/** Compatibility entry for old sync links; cloud consent lives in Settings. */
class LocationSyncActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(this, SettingsActivity::class.java))
        finish()
    }
}
