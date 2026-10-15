package com.haptilog.watch.data

import android.content.Context
import com.haptilog.watch.sync.CloudApi
import com.haptilog.watch.sync.CloudException
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
        override fun authenticate() = "token" to user
        override fun request(path: String, method: String, body: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String {
            paths.add(path)
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
}
