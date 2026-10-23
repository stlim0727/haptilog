package com.haptilog.watch.data

import android.content.Context
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
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
class RecordingDetailDataTest {
    private lateinit var context: Context
    private val id = "55555555-5555-4555-8555-555555555555"

    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        RecordingFiles.dir(context).listFiles()?.forEach { it.delete() }
        File(RecordingFiles.dir(context), "rec_$id.m4a").writeText("audio")
        RecordingFiles.write(
            File(RecordingFiles.dir(context), "meta_$id.json"),
            JSONObject().put("id", id).put("status", "COMPLETED").put("duration_seconds", 42)
                .put("started_at", "2026-10-23T05:00:00Z").put("latitude", 37.5).put("longitude", 127.0)
        )
    }

    private fun load(): RecordingItem {
        val repository = RecordingRepository(context)
        val items = runBlocking { repository.loadRecordingsFromDisk() }
        repository.close()
        assertEquals(1, items.size)
        return items.first()
    }

    @Test fun syncCheckpointDetailReachesTheDetailScreen() {
        RecordingFiles.write(
            File(RecordingFiles.dir(context), "sync_$id.json"),
            JSONObject().put("status", "ACTION_REQUIRED").put("attempts", 3).put("error", "HTTP_503")
                .put("uploaded", true).put("user_id", "66666666-6666-4666-8666-666666666666")
        )

        val item = load()
        assertEquals("ACTION_REQUIRED", item.syncStatus)
        assertEquals(3, item.syncAttempts)
        assertEquals("HTTP_503", item.syncError)
        assertTrue(item.uploaded)
    }

    @Test fun missingSyncStateKeepsDefaultsAndNoErrorText() {
        val item = load()
        assertEquals("PENDING_SYNC", item.syncStatus)
        assertEquals(0, item.syncAttempts)
        assertNull(item.syncError)
        assertFalse(item.uploaded)
        assertNull(item.structuredData)
    }

    @Test fun structuredEnrichmentIsCarriedAndNonObjectShapesAreIgnored() {
        RecordingFiles.write(
            File(RecordingFiles.dir(context), "enrich_$id.json"),
            JSONObject().put("intent_type", "EXPENSE").put("summary", "커피값").put("transcript", "커피 4500원")
                .put("structured_data", JSONObject().put("amount", 4500).put("currency", "KRW").put("merchant", "카페"))
        )
        assertEquals("카페", load().structuredData?.optString("merchant"))

        RecordingFiles.write(
            File(RecordingFiles.dir(context), "enrich_$id.json"),
            JSONObject().put("intent_type", "MEMO").put("structured_data", JSONArray().put("item"))
        )
        assertNull(load().structuredData)
    }
}
