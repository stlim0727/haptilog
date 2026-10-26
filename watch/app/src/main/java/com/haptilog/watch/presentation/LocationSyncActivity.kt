package com.haptilog.watch.presentation

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

/** Compatibility entry: collection and synchronization now share one screen. */
class LocationSyncActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(this, LocationJournalActivity::class.java))
        finish()
    }
}
