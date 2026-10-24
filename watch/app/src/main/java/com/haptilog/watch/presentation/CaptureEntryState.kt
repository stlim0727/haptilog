package com.haptilog.watch.presentation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import java.util.UUID

/** A request is distinct from Activity resume: internal returns keep the browsing position. */
class CaptureEntryState : ViewModel() {
    var request by mutableStateOf(UUID.randomUUID().toString())
        private set
    var internalReturn = false
        private set

    fun requestCapture() { request = UUID.randomUUID().toString() }
    fun beginInternalReturn() { internalReturn = true }
    fun userLeaving() { if (!internalReturn) requestCapture() }
    fun cancelInternalReturn() { internalReturn = false }
    fun resumed() { cancelInternalReturn() }
    fun restoreInternalReturn(wasInternal: Boolean, savedRequest: String?) {
        if (wasInternal && savedRequest != null) {
            internalReturn = true
            request = savedRequest
        }
    }
}
