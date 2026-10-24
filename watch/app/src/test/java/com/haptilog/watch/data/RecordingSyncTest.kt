package com.haptilog.watch.data

import android.content.Context
import com.haptilog.watch.sync.CloudApi
import com.haptilog.watch.sync.CloudException
import com.haptilog.watch.sync.RecordingDeleter
import com.haptilog.watch.sync.RecordingUploader
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = android.app.Application::class)
class RecordingSyncTest {
    private lateinit var context: Context
    private val id = "33333333-3333-4333-8333-333333333333"
    private lateinit var meta: JSONObject
    private lateinit var stateFile: File
    private class FakeCloud(var failEnrichment: Boolean = false, var user: String = "owner") : CloudApi {
        val paths = mutableListOf<String>()
        val requests = mutableListOf<Triple<String, String, String?>>()
        override fun authenticate() = "token" to user
        override fun request(path: String, method: String, body: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String {
            paths.add(path)
            requests.add(Triple(path, method, body?.let { String(it) }))
            if (path.startsWith("/functions") && failEnrichment) throw CloudException(503)
            return if (path.startsWith("/functions")) "{\"summary\":\"memo\",\"intent_type\":\"MEMO\",\"transcript\":\"test\",\"structured_data\":{}}" else ""
        }
    }
    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        val dir = RecordingFiles.dir(context)
        dir.listFiles()?.forEach { it.delete() }
        File(dir, "rec_$id.m4a").writeText("raw audio")
        meta = JSONObject().put("id", id).put("status", "COMPLETED").put("started_at", "2026-10-14T01:00:00Z")
        RecordingFiles.write(File(dir, "meta_$id.json"), meta)
        stateFile = File(dir, "sync_$id.json")
    }
    @Test fun failureAfterUploadResumesWithoutReuploadAndPreservesSources() {
        val client = FakeCloud(failEnrichment = true)
        val uploader = RecordingUploader(context)
        try { uploader.upload(meta, JSONObject(), stateFile, client); fail("must fail") } catch (_: CloudException) {}
        val checkpoint = RecordingFiles.read(stateFile)
        assertTrue(checkpoint.getBoolean("uploaded"))
        assertEquals("raw audio", File(stateFile.parentFile, "rec_$id.m4a").readText())
        val original = File(stateFile.parentFile, "meta_$id.json").readBytes()
        client.failEnrichment = false
        uploader.upload(meta, checkpoint, stateFile, client)
        assertEquals(1, client.paths.count { it.startsWith("/storage") })
        assertEquals("SYNCED", RecordingFiles.read(stateFile).getString("status"))
        assertArrayEquals(original, File(stateFile.parentFile, "meta_$id.json").readBytes())
        assertTrue(File(stateFile.parentFile, "enrich_$id.json").exists())
    }
    @Test fun changedIdentityCannotReassignAnUploadedRecording() {
        val client = FakeCloud(user = "new-owner")
        try {
            RecordingUploader(context).upload(meta, JSONObject().put("user_id", "old-owner"), stateFile, client)
            fail("owner must stay stable")
        } catch (e: CloudException) { assertEquals(403, e.status) }
        assertTrue(client.paths.isEmpty())
    }
    @Test fun interruptionRecoveryNeverUploadsAutomatically() {
        meta.put("status", "INTERRUPTED")
        val client = FakeCloud()
        try { RecordingUploader(context).upload(meta, JSONObject(), stateFile, client); fail("must reject") }
        catch (_: IllegalArgumentException) {}
        assertTrue(client.paths.isEmpty())
    }
    @Test fun deleterPatchesDeletedAtOnRemoteAndRemovesDeleteFile() {
        val client = FakeCloud()
        val dir = RecordingFiles.dir(context)
        val deleteFile = File(dir, "delete_$id.json")
        val timestamp = "2026-10-24T05:00:00Z"
        RecordingFiles.write(deleteFile, JSONObject().put("id", id).put("deleted_at", timestamp))
        assertTrue(deleteFile.exists())

        RecordingDeleter(context).delete(id, deleteFile, client)

        assertEquals(1, client.paths.count { it.startsWith("/rest/v1/recordings") })
        val request = client.requests.first { it.first.startsWith("/rest/v1/recordings") }
        assertEquals("PATCH", request.second)
        val bodyJson = JSONObject(request.third!!)
        assertEquals(timestamp, bodyJson.getString("deleted_at"))
        assertFalse(deleteFile.exists())
    }
    @Test fun repositoryDeleteLeavesTombstoneForCloudSyncWhenUploaded() {
        val dir = RecordingFiles.dir(context)
        RecordingFiles.write(stateFile, JSONObject().put("uploaded", true).put("status", "SYNCED"))
        val repo = RecordingRepository(context)

        val deleted = repo.deleteRecording(id)

        assertTrue(deleted)
        assertFalse(File(dir, "rec_$id.m4a").exists())
        assertFalse(File(dir, "meta_$id.json").exists())
        assertFalse(stateFile.exists())
        val deleteFile = File(dir, "delete_$id.json")
        assertTrue(deleteFile.exists())
        val deleteData = RecordingFiles.read(deleteFile)
        assertEquals(id, deleteData.getString("id"))
        assertTrue(deleteData.has("deleted_at"))
        repo.close()
    }
}
