package com.haptilog.watch.data.location

import android.content.Context
import android.util.AtomicFile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Separate, device-only store. Never enters the recording upload/export pipeline. Call mutations on IO. */
class LocationHistoryRepository internal constructor(private val directory: File) {
    private val file = AtomicFile(File(directory, "history.json"))
    private val mutableState = MutableStateFlow(load())
    val state: StateFlow<LocationHistorySnapshot> = mutableState.asStateFlow()
    private var detector: LocationEventDetector? = null

    init { prune() }

    /** Expire persisted observations on access, even if collection stays disabled. */
    @Synchronized fun prune(nowMillis: Long = System.currentTimeMillis()) {
        val current = state.value
        val next = retained(current, nowMillis)
        if (next != current) persist(next)
    }

    @Synchronized fun startSession(sessionStartElapsedMillis: Long = 0L) {
        check(detector == null) { "Location session already active" }
        prune()
        detector = LocationEventDetector(state.value.places, state.value.dwellMinutes, sessionStartElapsedMillis)
        mutableState.value = state.value.copy(latestSample = null)
    }

    @Synchronized fun setInitialFix(sample: LocationSample) {
        if (state.value.latestSample == null) {
            mutableState.value = state.value.copy(latestSample = sample)
        }
    }

    @Synchronized fun stopSession() {
        detector = null
        mutableState.value = state.value.copy(latestSample = null)
    }

    @Synchronized fun recordSample(sample: LocationSample, nowElapsedRealtimeMillis: Long): Boolean {
        val result = detector?.accept(sample, nowElapsedRealtimeMillis) ?: return false
        if (!result.accepted) return false
        val old = state.value
        val next = retained(old.copy(
            points = if (result.retainPoint) old.points + sample else old.points,
            events = old.events + result.events,
            latestSample = sample
        ), System.currentTimeMillis())
        if (old.points != next.points || old.events != next.events) persist(next)
        else mutableState.value = next
        return true
    }

    /** Upsert by id so an edited place does not orphan the label of past events. */
    @Synchronized fun addPlace(place: SavedPlace) {
        requireStopped()
        val previous = state.value.places
        require(previous.any { it.id == place.id } || previous.size < MAX_PLACES) { "At most $MAX_PLACES places" }
        persist(state.value.copy(places = previous.filterNot { it.id == place.id } + place))
    }

    @Synchronized fun removePlace(id: String) {
        requireStopped()
        persist(state.value.copy(places = state.value.places.filterNot { it.id == id }))
    }

    @Synchronized fun setDwellMinutes(minutes: Int) {
        requireStopped()
        require(minutes in setOf(5, 10, 20, 30))
        persist(state.value.copy(dwellMinutes = minutes))
    }

    @Synchronized fun clearHistory() {
        requireStopped()
        persist(state.value.copy(points = emptyList(), events = emptyList(), latestSample = null))
    }

    private fun requireStopped() { check(detector == null) { "Stop location history before changing settings" } }

    private fun persist(snapshot: LocationHistorySnapshot) {
        check(directory.isDirectory || directory.mkdirs()) { "Cannot create location history storage" }
        val json = JSONObject().put("version", 1).put("dwell_minutes", snapshot.dwellMinutes)
            .put("places", JSONArray().apply { snapshot.places.forEach { put(it.toJson()) } })
            .put("points", JSONArray().apply { snapshot.points.forEach { put(it.toJson()) } })
            .put("events", JSONArray().apply { snapshot.events.forEach { put(it.toJson()) } })
        val output = file.startWrite()
        try {
            output.write(json.toString().toByteArray(Charsets.UTF_8))
            file.finishWrite(output)
        } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }
        // Publish only after the atomic file has committed.
        mutableState.value = snapshot
    }

    private fun load(): LocationHistorySnapshot {
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return LocationHistorySnapshot()
        val json = file.openRead().bufferedReader().use { JSONObject(it.readText()) }
        require(json.getInt("version") == 1) { "Unsupported location history format" }
        val snapshot = LocationHistorySnapshot(
            places = json.getJSONArray("places").objects().map { it.toPlace() }.take(MAX_PLACES),
            points = json.getJSONArray("points").objects().map { it.toSample() },
            events = json.getJSONArray("events").objects().map { it.toEvent() },
            dwellMinutes = json.getInt("dwell_minutes").also { require(it in setOf(5, 10, 20, 30)) }
        )
        return snapshot
    }

    companion object {
        const val MAX_PLACES = 20
        const val MAX_POINTS = 2_000
        const val MAX_EVENTS = 500
        const val RETENTION_MILLIS = 7 * 24 * 60 * 60_000L
        @Volatile private var instance: LocationHistoryRepository? = null

        fun get(context: Context): LocationHistoryRepository = (instance ?: synchronized(this) {
            instance ?: LocationHistoryRepository(File(context.applicationContext.filesDir, "location_history"))
                .also { instance = it }
        }).also { it.prune() }

        internal fun retained(snapshot: LocationHistorySnapshot, nowMillis: Long) = snapshot.copy(
            points = snapshot.points.filter { it.timestampMillis >= nowMillis - RETENTION_MILLIS }.takeLast(MAX_POINTS),
            events = snapshot.events.filter { it.sample.timestampMillis >= nowMillis - RETENTION_MILLIS }.takeLast(MAX_EVENTS)
        )
    }
}

private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
private fun LocationSample.toJson() = JSONObject().put("latitude", latitude).put("longitude", longitude)
    .put("accuracy_meters", accuracyMeters).put("timestamp_millis", timestampMillis)
    .put("elapsed_realtime_millis", elapsedRealtimeMillis)
private fun JSONObject.toSample() = LocationSample(getDouble("latitude"), getDouble("longitude"),
    getDouble("accuracy_meters").toFloat(), getLong("timestamp_millis"), getLong("elapsed_realtime_millis"))
private fun SavedPlace.toJson() = JSONObject().put("id", id).put("name", name).put("latitude", latitude)
    .put("longitude", longitude).put("radius_meters", radiusMeters)
private fun JSONObject.toPlace() = SavedPlace(getString("id"), getString("name"), getDouble("latitude"),
    getDouble("longitude"), getDouble("radius_meters"))
private fun LocationEvent.toJson() = JSONObject().put("id", id).put("type", type.name).put("sample", sample.toJson())
    .put("place_id", placeId ?: JSONObject.NULL).put("place_name", placeName ?: JSONObject.NULL)
    .put("started_at_millis", startedAtMillis).put("duration_millis", durationMillis)
private fun JSONObject.toEvent() = LocationEvent(LocationEventType.valueOf(getString("type")),
    getJSONObject("sample").toSample(), optString("place_id").takeUnless { it.isEmpty() || it == "null" },
    optString("place_name").takeUnless { it.isEmpty() || it == "null" }, getLong("started_at_millis"),
    getLong("duration_millis"), getString("id"))
