package com.haptilog.watch.data.location

import android.content.Context
import android.location.Location
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlin.math.abs

/** Immutable observations, before stay/movement filtering. ACKs never rewrite sources. IO only. */
class RawLocationOutbox internal constructor(private val directory: File) {
    private var sequence = 0L
    private var previous: Location? = null
    private var session: String? = null

    @Synchronized fun append(location: Location, nowElapsed: Long, sessionId: String, grant: JSONObject?): Boolean {
        val elapsed = location.elapsedRealtimeNanos / 1_000_000
        val age = nowElapsed - elapsed
        if (!validCoordinates(location.latitude, location.longitude) || !location.hasAccuracy() ||
            !location.accuracy.isFinite() || location.accuracy <= 0 || location.accuracy > 10_000 ||
            location.time <= 0 || elapsed < 0 || age !in 0..120_000) return false
        if (session != sessionId) { session = sessionId; sequence = 0; previous = null; prune() }
        if (sequence % 100 == 0L) {
            // Withdrawal is an explicit terminal exclusion, not a new upload grant.
            pending().filter { !it.isNull("grant") && it.getJSONObject("grant").toString() != grant?.toString() }
                .forEach { acknowledge(it.getJSONObject("sample").getString("id"), "consent_excluded") }
            prune()
        }
        val last = previous
        if (last != null && elapsed <= last.elapsedRealtimeNanos / 1_000_000) return false
        check(directory.isDirectory || directory.mkdirs())
        // Stop collection on disk pressure; never silently evict an unacknowledged source.
        check(sources().size < MAX_SAMPLES) { "Raw location storage full; connect to sync or clear location data" }
        val id = UUID.randomUUID().toString()
        val sample = JSONObject().put("id", id).put("session_id", sessionId).put("sequence", sequence + 1)
            .put("observed_at", Instant.ofEpochMilli(location.time).toString())
            .put("elapsed_realtime_millis", elapsed).put("fix_age_millis", age)
            .put("latitude", location.latitude).put("longitude", location.longitude).put("accuracy_meters", location.accuracy.toDouble())
            .put("clock_discontinuity", last != null && abs((location.time - last.time) -
                (elapsed - last.elapsedRealtimeNanos / 1_000_000)) > 5_000)
        if (location.hasAltitude() && location.altitude.isFinite() && abs(location.altitude) <= 100_000) sample.put("altitude", location.altitude)
        if (location.hasSpeed() && location.speed.isFinite() && location.speed in 0f..100_000f) sample.put("speed", location.speed.toDouble())
        write(File(directory, "sample_$id.json"), JSONObject().put("sample", sample)
            .put("grant", grant ?: JSONObject.NULL))
        sequence++
        previous = Location(location)
        return true
    }

    @Synchronized fun pending(): List<JSONObject> = sources().mapNotNull { source ->
        val id = source.name.removePrefix("sample_").removeSuffix(".json")
        if (File(directory, "ack_$id.json").exists() || File(directory, "rejected_$id.json").exists()) null else read(source)
    }.sortedWith(compareBy({ it.getJSONObject("sample").getString("session_id") }, { it.getJSONObject("sample").getLong("sequence") }))

    @Synchronized fun acknowledge(id: String, outcome: String) {
        UUID.fromString(id)
        require(outcome in setOf("accepted", "idempotent", "expired", "deleted", "consent_excluded", "local_only"))
        write(File(directory, "ack_$id.json"), JSONObject().put("outcome", outcome))
    }

    /** Separate local rejection checkpoint: never rewrite a source or claim server acceptance. */
    @Synchronized fun quarantine(id: String, reason: String) {
        UUID.fromString(id)
        require(reason in setOf("INVALID_PAYLOAD", "CONTENT_CONFLICT"))
        write(File(directory, "rejected_$id.json"), JSONObject().put("reason", reason))
    }

    @Synchronized fun prune(now: Long = System.currentTimeMillis()) {
        for (source in sources()) {
            val row = read(source)
            val sample = row.getJSONObject("sample")
            val ack = File(directory, "ack_${sample.getString("id")}.json")
            // Unconsented local observations are terminal local-only, never backfilled.
            val rejected = File(directory, "rejected_${sample.getString("id")}.json")
            val terminal = ack.exists() || rejected.exists() || row.isNull("grant")
            if (terminal && Instant.parse(sample.getString("observed_at")).toEpochMilli() <= now - RETENTION_MILLIS) {
                check(source.delete()); if (ack.exists()) check(ack.delete())
                if (rejected.exists()) check(rejected.delete())
            }
        }
    }

    private fun sources() = directory.listFiles().orEmpty().filter { it.name.startsWith("sample_") && it.extension == "json" }
    companion object {
        const val MAX_SAMPLES = 20_000
        const val RETENTION_MILLIS = 7 * 24 * 60 * 60_000L
        @Volatile private var instance: RawLocationOutbox? = null
        fun get(context: Context): RawLocationOutbox = instance ?: synchronized(this) {
            instance ?: RawLocationOutbox(File(context.applicationContext.filesDir, "raw_location" )).also { instance = it }
        }
        private fun read(file: File): JSONObject = AtomicFile(file).openRead().bufferedReader().use { JSONObject(it.readText()) }
        private fun write(file: File, json: JSONObject) {
            val atomic = AtomicFile(file)
            val out = atomic.startWrite()
            try { out.write(json.toString().toByteArray(Charsets.UTF_8)); atomic.finishWrite(out) }
            catch (error: Exception) { atomic.failWrite(out); throw error }
        }
    }
}
