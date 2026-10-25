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
import com.haptilog.watch.sync.CloudClient
import com.haptilog.watch.sync.CloudConsent
import com.haptilog.watch.sync.RecordingDeleteWorker
import com.haptilog.watch.sync.RecordingDeleter
import com.haptilog.watch.sync.RecordingSyncWorker
import kotlinx.coroutines.cancel
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
                val json = RecordingFiles.read(metaFile)
                val id = json.optString("id", "")
                if (!RecordingFiles.validId(id)) return@mapNotNull null

                val audioFile = File(recordingsDir, "rec_${id}.m4a")
                val startedAtIso = json.optString("started_at", "")
                val timestamp = try {
                    Instant.parse(startedAtIso).toEpochMilli()
                } catch (_: Exception) {
                    metaFile.lastModified()
                }

                val durationSeconds = json.optInt("duration_seconds", 0)
                val status = json.optString("status", "UNKNOWN")
                val syncFile = File(recordingsDir, "sync_$id.json")
                val sync = if (syncFile.exists()) runCatching { RecordingFiles.read(syncFile) }.getOrNull() else null
                val syncStatus = sync?.optString("status") ?: json.optString("sync_status", "PENDING_SYNC")
                val derivedFile = File(recordingsDir, "enrich_$id.json")
                val derived = if (derivedFile.exists()) runCatching { RecordingFiles.read(derivedFile) }.getOrNull() else null

                val lat = if (json.has("latitude")) json.optDouble("latitude") else null
                val lon = if (json.has("longitude")) json.optDouble("longitude") else null
                val alt = if (json.has("altitude")) json.optDouble("altitude") else null
                val spd = if (json.has("speed")) json.optDouble("speed").toFloat() else null
                val acc = if (json.has("accuracy")) json.optDouble("accuracy").toFloat() else null

                val intentType = derived?.optString("intent_type")
                val summary = derived?.optString("summary")
                val transcript = derived?.optString("transcript")
                val structuredData = derived?.optJSONObject("structured_data")

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
                    transcript = transcript,
                    syncAttempts = sync?.optInt("attempts", 0) ?: 0,
                    syncError = sync?.optString("error")?.takeIf { it.isNotBlank() },
                    uploaded = sync?.optBoolean("uploaded") ?: false,
                    structuredData = structuredData
                )
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }.sortedByDescending { it.startedAtTimestamp }
    }

    fun close() { scope.cancel() }

    fun deleteRecording(id: String): Boolean {
        if (!RecordingFiles.validId(id)) return false
        var deleted = false
        try {
            val metaFile = File(recordingsDir, "meta_${id}.json")
            val audioFile = File(recordingsDir, "rec_${id}.m4a")
            val syncFile = File(recordingsDir, "sync_$id.json")
            val enrichFile = File(recordingsDir, "enrich_$id.json")

            val syncData = if (syncFile.exists()) runCatching { RecordingFiles.read(syncFile) }.getOrNull() else null
            val wasSyncedOrUploaded = syncData != null && (
                syncData.optBoolean("uploaded") ||
                syncData.optString("status") in listOf("SYNCED", "SYNCING", "PENDING_SYNC", "ACTION_REQUIRED")
            )

            val deleteFile = File(recordingsDir, "delete_$id.json")
            if (wasSyncedOrUploaded || (CloudConsent.accepted(context) && CloudClient.configured)) {
                val deleteData = JSONObject().apply {
                    put("id", id)
                    put("deleted_at", Instant.now().toString())
                }
                val tombstoneSaved = runCatching {
                    RecordingFiles.write(deleteFile, deleteData)
                    deleteFile.exists()
                }.getOrDefault(false)
                if (!tombstoneSaved) return false
            }

            deleted = (!audioFile.exists() || audioFile.delete()) && (!metaFile.exists() || metaFile.delete())
            if (deleted) {
                com.haptilog.watch.notifications.RecordingNotifications.clearSync(context, id)
                listOf(syncFile, enrichFile).forEach { if (it.exists()) it.delete() }
            }
            refresh()

            RecordingSyncWorker.schedule(context)
            RecordingDeleteWorker.schedule(context)
            if (deleteFile.exists() && CloudClient.configured) {
                scope.launch {
                    try {
                        withContext(Dispatchers.IO) {
                            val client = CloudClient(context)
                            RecordingDeleter(context).delete(id, deleteFile, client)
                        }
                    } catch (_: Exception) {
                        // Offline or transient failure; delete worker retries with exponential backoff
                        RecordingDeleteWorker.schedule(context)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return deleted
    }
}
