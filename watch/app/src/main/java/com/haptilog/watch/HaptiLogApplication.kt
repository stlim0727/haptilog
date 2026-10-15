package com.haptilog.watch

import android.app.Application
import com.haptilog.watch.data.RecordingFiles
import com.haptilog.watch.sync.RecordingSyncWorker

class HaptiLogApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Runs before UI/service launches in this process; never finalizes an active recorder.
        RecordingFiles.recover(this)
        RecordingSyncWorker.schedule(this)
    }
}
