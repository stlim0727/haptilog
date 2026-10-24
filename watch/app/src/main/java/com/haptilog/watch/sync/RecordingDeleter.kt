package com.haptilog.watch.sync

import android.content.Context
import com.haptilog.watch.data.RecordingFiles
import org.json.JSONObject
import java.io.File
import java.time.Instant

/** Marks cloud recordings as soft-deleted (wastebin) so they disappear from the active web portal. */
class RecordingDeleter(private val context: Context) {
    companion object {
        private val deleteLock = Any()
    }

    fun delete(id: String, deleteFile: File, client: CloudApi = CloudClient(context)) {
        require(RecordingFiles.validId(id))
        synchronized(deleteLock) {
            if (!deleteFile.exists()) return
            val data = runCatching { RecordingFiles.read(deleteFile) }.getOrNull()
            val deletedAt = data?.optString("deleted_at")?.takeIf { it.isNotBlank() } ?: Instant.now().toString()
            val (token, _) = client.authenticate()
            val body = JSONObject().put("deleted_at", deletedAt).toString().toByteArray()
            client.request(
                "/rest/v1/recordings?id=eq.$id",
                "PATCH",
                body,
                token,
                extra = mapOf("Prefer" to "return=minimal")
            )
            if (deleteFile.exists()) {
                deleteFile.delete()
            }
        }
    }
}
