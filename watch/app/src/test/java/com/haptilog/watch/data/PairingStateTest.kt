package com.haptilog.watch.data

import com.haptilog.watch.presentation.pairedDuringCode
import org.junit.Assert.*
import org.junit.Test

class PairingStateTest {
    private val expiry = "2026-10-17T09:05:00Z"
    @Test fun newConnectionClearsIssuedCodeIncludingRepairedBrowser() {
        assertTrue(pairedDuringCode(expiry, "2026-10-17T09:00:01Z"))
        assertTrue(pairedDuringCode(expiry, "2026-10-17T09:04:59.999999Z"))
    }
    @Test fun priorConnectionsAndExpiredOrMalformedValuesDoNotClearCode() {
        assertFalse(pairedDuringCode(expiry, "2026-10-17T08:59:59.999999Z"))
        assertFalse(pairedDuringCode(expiry, "2026-10-17T09:05:00Z"))
        assertFalse(pairedDuringCode(expiry, "invalid"))
    }
}
