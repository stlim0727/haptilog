package com.haptilog.watch.presentation

import java.time.Instant

/** Use server timestamps so an older browser grant never consumes a new code UI. */
fun pairedDuringCode(expiresAt: String, connectedAt: String): Boolean = runCatching {
    val expiry = Instant.parse(expiresAt)
    val connected = Instant.parse(connectedAt)
    !connected.isBefore(expiry.minusSeconds(300)) && connected.isBefore(expiry)
}.getOrDefault(false)
