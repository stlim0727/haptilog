package com.haptilog.watch.sync

import android.location.Location
import com.haptilog.watch.data.location.RawLocationOutbox
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.nio.file.Files

@RunWith(RobolectricTestRunner::class)
class RawLocationSyncTest {
    private val grant = JSONObject().put("owner", "owner").put("consent_id", "consent")
    private val session = "11111111-1111-4111-8111-111111111111"
    private fun location(elapsed: Long = 1000) = Location("gps").apply {
        latitude = 0.0; longitude = 0.0; accuracy = 800f
        time = System.currentTimeMillis() + elapsed - 1000
        elapsedRealtimeNanos = elapsed * 1_000_000
        speed = 0f
    }
    private fun dir() = Files.createTempDirectory("raw-location-test").toFile()
    private fun api(reply: (JSONObject) -> JSONObject) = object : CloudApi {
        override fun authenticate() = "token" to "owner"
        override fun request(path: String, method: String, body: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String {
            assertEquals("/rest/v1/rpc/raw_locations", path)
            val input = JSONObject(String(body!!))
            return if (input.getString("p_action") == "status") JSONObject().put("protocol_version", 1)
                .put("consent_id", "consent").put("sync_epoch", 0).toString()
            else reply(input.getJSONObject("p_payload")).put("protocol_version", 1).toString()
        }
    }
    private fun ack(payload: JSONObject): JSONObject {
        val samples = payload.getJSONArray("samples")
        return JSONObject().put("results", JSONArray((0 until samples.length()).map {
            JSONObject().put("id", samples.getJSONObject(it).getString("id")).put("outcome", "accepted")
        }))
    }
    @Test fun stationaryAndInaccurateFixesAreDurableBeforeMovementFiltering() {
        val directory = dir(); val outbox = RawLocationOutbox(directory)
        assertTrue(outbox.append(location(), 1000, session, grant))
        assertTrue(outbox.append(location(61000), 61000, session, grant))
        val rows = RawLocationOutbox(directory).pending()
        assertEquals(2, rows.size)
        assertEquals(800.0, rows[0].getJSONObject("sample").getDouble("accuracy_meters"), 0.0)
        assertEquals(0.0, rows[0].getJSONObject("sample").getDouble("speed"), 0.0)
        assertFalse(rows[0].getJSONObject("sample").has("altitude"))
        assertFalse(outbox.append(location(61000), 61000, session, grant))
        assertFalse(outbox.append(location(62000), 200000, session, grant))
    }
    @Test fun lostAcknowledgementRetriesIdenticalIdsAndContentAfterProcessDeath() {
        val directory = dir(); val original = RawLocationOutbox(directory)
        original.append(location(), 1000, session, grant)
        val before = original.pending()[0].getJSONObject("sample").toString()
        var committed = false
        val lost = RawLocationClient(api { committed = true; throw java.io.IOException("lost ACK") })
        assertThrows(java.io.IOException::class.java) { RawLocationSyncWorker.flush(original, lost, grant) { true } }
        assertTrue(committed)
        val recovered = RawLocationOutbox(directory)
        assertEquals(before, recovered.pending()[0].getJSONObject("sample").toString())
        RawLocationSyncWorker.flush(recovered, RawLocationClient(api { payload ->
            assertEquals(before, payload.getJSONArray("samples").getJSONObject(0).toString()); ack(payload)
        }), grant) { true }
        assertTrue(RawLocationOutbox(directory).pending().isEmpty())
        assertEquals(1, directory.listFiles()!!.count { it.name.startsWith("sample_") })
    }
    @Test fun incompleteOrUnknownAckNeverCheckpointsSources() {
        val directory = dir(); val outbox = RawLocationOutbox(directory)
        outbox.append(location(), 1000, session, grant)
        assertThrows(IllegalStateException::class.java) {
            RawLocationSyncWorker.flush(outbox, RawLocationClient(api { JSONObject().put("results", JSONArray()) }), grant) { true }
        }
        assertEquals(1, RawLocationOutbox(directory).pending().size)
    }
    @Test fun revokedOrReplacedConsentNeverReassignsQueuedSources() {
        val directory = dir(); val outbox = RawLocationOutbox(directory)
        outbox.append(location(), 1000, session, JSONObject().put("owner", "owner").put("consent_id", "old"))
        var calls = 0
        RawLocationSyncWorker.flush(outbox, RawLocationClient(api { calls++; ack(it) }), grant) { true }
        assertEquals(0, calls); assertTrue(outbox.pending().isEmpty())
        val local = RawLocationOutbox(dir());local.append(location(), 1000, session, null)
        RawLocationSyncWorker.flush(local, RawLocationClient(api { calls++; ack(it) }), grant) { true }
        assertEquals(0, calls)
    }
    @Test fun withdrawalBeforeBatchStopsSendingAndExpiredPendingIsPreserved() {
        val directory = dir();val outbox = RawLocationOutbox(directory)
        outbox.append(location(), 1000, session, grant)
        outbox.prune(System.currentTimeMillis() + 8 * 86400000L)
        assertEquals(1, outbox.pending().size)
        RawLocationSyncWorker.flush(outbox, RawLocationClient(api { throw AssertionError("must not send") }), grant) { false }
        assertEquals(1, outbox.pending().size)
    }
    @Test fun rejectedFutureSampleDoesNotBlockValidSamplesOrReturnAfterRestart() {
        val directory = dir(); val outbox = RawLocationOutbox(directory)
        val future = location().apply { time += 86400000L }
        outbox.append(future, 1000, session, grant)
        outbox.append(location(2000), 2000, session, grant)
        val original = outbox.pending().first().getJSONObject("sample")
        val rejectedId = original.getString("id")
        var calls = 0
        RawLocationSyncWorker.flush(outbox, RawLocationClient(api { payload ->
            calls++
            val samples = payload.getJSONArray("samples")
            if ((0 until samples.length()).any { samples.getJSONObject(it).getString("id") == rejectedId })
                JSONObject().put("error", "INVALID_PAYLOAD") else ack(payload)
        }), grant) { true }
        assertEquals(3, calls)
        assertTrue(RawLocationOutbox(directory).pending().isEmpty())
        val source = java.io.File(directory, "sample_$rejectedId.json")
        assertEquals(original.toString(), JSONObject(source.readText()).getJSONObject("sample").toString())
        assertFalse(java.io.File(directory, "ack_$rejectedId.json").exists())
        assertEquals("INVALID_PAYLOAD", JSONObject(java.io.File(directory, "rejected_$rejectedId.json").readText()).getString("reason"))
        val restarted = RawLocationOutbox(directory)
        restarted.append(location(3000), 3000, session, grant)
        RawLocationSyncWorker.flush(restarted, RawLocationClient(api { payload ->
            assertEquals(1, payload.getJSONArray("samples").length()); ack(payload)
        }), grant) { true }
        assertTrue(restarted.pending().isEmpty())
        restarted.prune()
        assertTrue(source.exists())
        restarted.prune(future.time + RawLocationOutbox.RETENTION_MILLIS + 1)
        assertFalse(source.exists())
        assertFalse(java.io.File(directory, "rejected_$rejectedId.json").exists())
    }
    @Test fun transientFailureNeverQuarantinesAndWithdrawalStopsSplitRequests() {
        val directory = dir(); val outbox = RawLocationOutbox(directory)
        outbox.append(location(), 1000, session, grant)
        outbox.append(location(2000), 2000, session, grant)
        assertThrows(LocationSyncException::class.java) {
            RawLocationSyncWorker.flush(outbox, RawLocationClient(api { JSONObject().put("error", "UNAVAILABLE") }), grant) { true }
        }
        assertEquals(2, outbox.pending().size)
        var allowed = true
        RawLocationSyncWorker.flush(outbox, RawLocationClient(api {
            allowed = false; JSONObject().put("error", "INVALID_PAYLOAD")
        }), grant) { allowed }
        assertEquals(2, RawLocationOutbox(directory).pending().size)
        assertEquals(0, directory.listFiles()!!.count { it.name.startsWith("rejected_") })
    }

    @Test fun contentConflictIsIsolatedWithoutChangingTheOriginal() {
        val directory = dir(); val outbox = RawLocationOutbox(directory)
        outbox.append(location(), 1000, session, grant)
        outbox.append(location(2000), 2000, session, grant)
        val rejected = outbox.pending().first().getJSONObject("sample").getString("id")
        RawLocationSyncWorker.flush(outbox, RawLocationClient(api { payload ->
            val samples = payload.getJSONArray("samples")
            if ((0 until samples.length()).any { samples.getJSONObject(it).getString("id") == rejected })
                JSONObject().put("error", "CONTENT_CONFLICT") else ack(payload)
        }), grant) { true }
        assertTrue(outbox.pending().isEmpty())
        assertEquals(2, directory.listFiles()!!.count { it.name.startsWith("sample_") })
        assertEquals(1, directory.listFiles()!!.count { it.name.startsWith("ack_") })
        assertEquals("CONTENT_CONFLICT", JSONObject(java.io.File(directory, "rejected_$rejected.json").readText()).getString("reason"))
    }

}
