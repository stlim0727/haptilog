package com.haptilog.watch.data

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Shared disk operations; derived sync/enrichment state never rewrites raw capture metadata. */
object RecordingFiles {
    private val lock = Any()
    fun validId(id: String): Boolean = runCatching { UUID.fromString(id).toString() == id }.getOrDefault(false)
    fun dir(context: Context) = File(context.filesDir, "recordings").apply { mkdirs() }
    fun read(file: File): JSONObject = synchronized(lock) {
        JSONObject(AtomicFile(file).openRead().bufferedReader().use { it.readText() })
    }
    fun write(file: File, json: JSONObject) = synchronized(lock) {
        val atomic = AtomicFile(file)
        val out = atomic.startWrite()
        try {
            out.write(json.toString().toByteArray(Charsets.UTF_8))
            atomic.finishWrite(out)
        } catch (e: Exception) { atomic.failWrite(out); throw e }
    }
    fun recover(context: Context) = synchronized(lock) {
        if (com.haptilog.watch.service.VoiceRecordingService.isRecording.value) return@synchronized
        dir(context).listFiles()?.filter { it.name.startsWith("meta_") && it.name.endsWith(".json") }?.forEach { file ->
            runCatching {
                val meta = read(file)
                if (meta.optString("status") == "RECORDING") {
                    meta.put("status", "INTERRUPTED")
                    meta.put("sync_status", "RECOVERY_REQUIRED")
                    write(file, meta)
                }
            }
        }
        // Preserve orphan audio after a crash before the initial metadata commit.
        dir(context).listFiles()?.filter { it.name.startsWith("rec_") && it.extension == "m4a" }?.forEach { audio ->
            val id = audio.name.removePrefix("rec_").removeSuffix(".m4a")
            val metaFile = File(dir(context), "meta_$id.json")
            if (validId(id) && !metaFile.exists()) {
                write(metaFile, JSONObject().put("id", id).put("status", "INTERRUPTED")
                    .put("started_at", java.time.Instant.ofEpochMilli(audio.lastModified()).toString())
                    .put("sync_status", "RECOVERY_REQUIRED"))
            }
        }
    }
}
