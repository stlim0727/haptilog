package com.haptilog.watch.data

import org.json.JSONObject
import java.io.File

/**
 * Represents a voice recording stored locally on the Galaxy Watch.
 */
data class RecordingItem(
    val id: String,
    val audioFile: File,
    val metaFile: File,
    val startedAtIso: String,
    val startedAtTimestamp: Long,
    val durationSeconds: Int,
    val status: String,
    val syncStatus: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val altitude: Double? = null,
    val speed: Float? = null,
    val accuracy: Float? = null,
    val intentType: String? = null,
    val summary: String? = null,
    val transcript: String? = null,
    val syncAttempts: Int = 0,
    val syncError: String? = null,
    val uploaded: Boolean = false,
    val structuredData: JSONObject? = null
)
