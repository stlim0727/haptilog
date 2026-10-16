package com.haptilog.watch.sync

import android.content.Context
import com.haptilog.watch.data.RecordingFiles
import org.json.JSONObject
import java.io.File

/** Retry checkpoints are committed only after the corresponding remote operation succeeds. */
class RecordingUploader(private val context: Context) {
    fun upload(meta: JSONObject, state: JSONObject, stateFile: File, client: CloudApi, checkContinue: () -> Unit = {}) {
        val id = meta.getString("id")
        require(RecordingFiles.validId(id) && meta.getString("status") == "COMPLETED")
        val directory = RecordingFiles.dir(context)
        val audio = File(directory, "rec_$id.m4a")
        checkContinue()
        val (token, userId) = client.authenticate()
        if (state.has("user_id") && state.getString("user_id") != userId) throw CloudException(403)
        state.put("user_id", userId).put("status", "SYNCING")
        RecordingFiles.write(stateFile, state)
        val path = "$userId/$id.m4a"
        val bytes = audio.readBytes()
        if (bytes.size > 1_350_000) throw CloudException(413)
        if (!state.optBoolean("uploaded")) {
            checkContinue()
            client.request("/storage/v1/object/recordings/$path", "POST", bytes, token, "audio/mp4", mapOf("x-upsert" to "true"))
            state.put("uploaded", true)
            RecordingFiles.write(stateFile, state)
        }
        val row = JSONObject().put("id", id).put("user_id", userId).put("audio_path", path)
            .put("recorded_at", meta.getString("started_at")).put("duration_seconds", meta.optInt("duration_seconds"))
        for (field in listOf("latitude", "longitude", "altitude", "speed", "accuracy")) if (meta.has(field)) row.put(field, meta.get(field))
        checkContinue()
        client.request("/rest/v1/recordings?on_conflict=id", "POST", row.toString().toByteArray(), token,
            extra = mapOf("Prefer" to "resolution=merge-duplicates,return=minimal"))
        val input = JSONObject().put("recording_id", id)
        checkContinue()
        val result = JSONObject(client.request("/functions/v1/voice-enrich", "POST", input.toString().toByteArray(), token))
        RecordingFiles.write(File(directory, "enrich_$id.json"), result)
        state.put("status", "SYNCED")
        RecordingFiles.write(stateFile, state)
    }
}
