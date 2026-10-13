package com.haptilog.watch.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.time.Instant

class RecordingRepository(private val context: Context) {

    private val recordingsDir = File(context.filesDir, "recordings")
    private val _recordings = MutableStateFlow<List<RecordingItem>>(emptyList())
    val recordings: StateFlow<List<RecordingItem>> = _recordings.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO)

    init {
        refresh()
    }

    fun refresh() {
        scope.launch {
            val list = loadRecordingsFromDisk()
            _recordings.value = list
        }
    }

    suspend fun loadRecordingsFromDisk(): List<RecordingItem> = withContext(Dispatchers.IO) {
        if (!recordingsDir.exists()) {
            return@withContext emptyList()
        }

        val metaFiles = recordingsDir.listFiles { file ->
            file.isFile && file.name.startsWith("meta_") && file.name.endsWith(".json")
        } ?: emptyArray()

        metaFiles.mapNotNull { metaFile ->
            try {
                val jsonStr = metaFile.readText(Charsets.UTF_8)
                val json = JSONObject(jsonStr)
                val id = json.optString("id", "")
                if (id.isEmpty()) return@mapNotNull null

                val audioFile = File(recordingsDir, "rec_${id}.m4a")
                val startedAtIso = json.optString("started_at", "")
                val timestamp = try {
                    Instant.parse(startedAtIso).toEpochMilli()
                } catch (_: Exception) {
                    metaFile.lastModified()
                }

                val durationSeconds = json.optInt("duration_seconds", 0)
                val status = json.optString("status", "UNKNOWN")
                val syncStatus = json.optString("sync_status", "PENDING_SYNC")

                val lat = if (json.has("latitude")) json.optDouble("latitude") else null
                val lon = if (json.has("longitude")) json.optDouble("longitude") else null
                val alt = if (json.has("altitude")) json.optDouble("altitude") else null
                val spd = if (json.has("speed")) json.optDouble("speed").toFloat() else null
                val acc = if (json.has("accuracy")) json.optDouble("accuracy").toFloat() else null

                val intentType = if (json.has("intent_type")) json.optString("intent_type") else null
                val summary = if (json.has("summary")) json.optString("summary") else null
                val transcript = if (json.has("transcript")) json.optString("transcript") else null

                RecordingItem(
                    id = id,
                    audioFile = audioFile,
                    metaFile = metaFile,
                    startedAtIso = startedAtIso,
                    startedAtTimestamp = timestamp,
                    durationSeconds = durationSeconds,
                    status = status,
                    syncStatus = syncStatus,
                    latitude = lat,
                    longitude = lon,
                    altitude = alt,
                    speed = spd,
                    accuracy = acc,
                    intentType = intentType,
                    summary = summary,
                    transcript = transcript
                )
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }.sortedByDescending { it.startedAtTimestamp }
    }

    fun deleteRecording(id: String): Boolean {
        var deleted = false
        try {
            val metaFile = File(recordingsDir, "meta_${id}.json")
            val audioFile = File(recordingsDir, "rec_${id}.m4a")
            if (metaFile.exists()) metaFile.delete()
            if (audioFile.exists()) audioFile.delete()
            deleted = true
            refresh()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return deleted
    }
}
