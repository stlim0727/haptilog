package com.haptilog.watch.presentation

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

/** Old notification intents still resolve after an upgrade; journal UI is retired. */
class LocationJournalActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(this, LocationSettingsActivity::class.java))
        finish()
    }
}
