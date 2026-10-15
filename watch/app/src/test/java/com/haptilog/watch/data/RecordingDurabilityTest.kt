package com.haptilog.watch.data

import android.content.Context
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipInputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = android.app.Application::class)
class RecordingDurabilityTest {
    private lateinit var context: Context
    private val id = "33333333-3333-4333-8333-333333333333"
    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        RecordingFiles.dir(context).listFiles()?.forEach { it.delete() }
    }
    @Test fun crashedRecordingIsPreservedAndNeverMarkedReadyToSync() {
        val dir = RecordingFiles.dir(context)
        val audio = File(dir, "rec_$id.m4a").apply { writeText("partial audio") }
        val metaFile = File(dir, "meta_$id.json")
        RecordingFiles.write(metaFile, JSONObject().put("id", id).put("status", "RECORDING").put("latitude", 37.0))
        RecordingFiles.recover(context)
        val recovered = RecordingFiles.read(metaFile)
        assertEquals("INTERRUPTED", recovered.getString("status"))
        assertEquals("RECOVERY_REQUIRED", recovered.getString("sync_status"))
        assertEquals(37.0, recovered.getDouble("latitude"), 0.001)
        assertEquals("partial audio", audio.readText())
        RecordingFiles.recover(context)
        assertEquals(recovered.toString(), RecordingFiles.read(metaFile).toString())
    }
    @Test fun orphanAudioGetsDiscoverableMetadata() {
        File(RecordingFiles.dir(context), "rec_$id.m4a").writeText("audio")
        RecordingFiles.recover(context)
        assertEquals(id, RecordingFiles.read(File(RecordingFiles.dir(context), "meta_$id.json")).getString("id"))
    }
    @Test fun completedSourceIsUntouchedByRecoveryOrDerivedResults() {
        val file = File(RecordingFiles.dir(context), "meta_$id.json")
        RecordingFiles.write(file, JSONObject().put("id", id).put("status", "COMPLETED"))
        val before = file.readBytes()
        RecordingFiles.write(File(file.parentFile, "enrich_$id.json"), JSONObject().put("summary", "memo"))
        RecordingFiles.recover(context)
        assertArrayEquals(before, file.readBytes())
    }
    @Test fun exportContainsSourcesAndEnrichmentButNoSessionOrSyncIdentity() {
        val dir = RecordingFiles.dir(context)
        File(dir, "rec_$id.m4a").writeText("audio")
        File(dir, "meta_$id.json").writeText("{\"id\":\"$id\"}")
        File(dir, "enrich_$id.json").writeText("{\"summary\":\"memo\"}")
        File(dir, "sync_$id.json").writeText("private identity")
        val output = ByteArrayOutputStream()
        RecordingExport.write(context, id, output)
        val names = mutableListOf<String>()
        ZipInputStream(output.toByteArray().inputStream()).use { zip ->
            while (true) { val entry = zip.nextEntry ?: break; names.add(entry.name) }
        }
        assertEquals(setOf("rec_$id.m4a", "meta_$id.json", "enrich_$id.json"), names.toSet())
    }
}
