package com.haptilog.watch.sync

import android.content.Context
import org.robolectric.RuntimeEnvironment
import androidx.work.Configuration
import androidx.work.WorkManager
import com.haptilog.watch.data.location.LocationHistoryRepository
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LocationConsentTest {
    private class FakeCloud : CloudApi {
        var consentRevision = 0L
        var placesRevision = 0L
        val places = JSONArray()
        val actions = mutableListOf<String>()
        override fun authenticate() = "token" to "owner-uuid"
        override fun request(path: String, method: String, body: ByteArray?, token: String?,
                             contentType: String, extra: Map<String, String>): String {
            val action = JSONObject(String(body!!)).getString("p_action")
            actions += action
            val state = JSONObject().put("consent_enabled", consentRevision > 0)
                .put("consent_revision", consentRevision).put("sync_epoch", 0)
                .put("upload_cutoff", if (consentRevision > 0) "2020-01-01T00:00:00Z" else JSONObject.NULL)
                .put("purged_before", JSONObject.NULL)
                .put("places_revision", placesRevision).put("applied_places_revision", 0)
                .put("threshold_minutes", 10)
            return when (action) {
                "snapshot" -> JSONObject().put("protocol_version", 1).put("state", state)
                    .put("places", JSONArray(places.toString())).put("stays", JSONArray())
                    .put("deleted_ids", JSONArray()).toString()
                "consent" -> { consentRevision = 1; JSONObject().put("state", state).toString() }
                "put_place" -> {
                    places.put(JSONObject(String(body!!)).getJSONObject("p_payload"))
                    state.put("places_revision", ++placesRevision)
                    JSONObject().put("state", state).toString()
                }
                else -> JSONObject().put("state", state).toString()
            }
        }
    }

    @Before fun setUp() {
        val context = RuntimeEnvironment.getApplication() as Context
        try { WorkManager.getInstance(context) }
        catch (_: IllegalStateException) { WorkManager.initialize(context, Configuration.Builder().build()) }
        LocationConsent.preferences(context).edit().clear().commit()
        val directory = java.io.File(context.filesDir, "location_history").apply { mkdirs() }
        val history = JSONObject().put("version", 2).put("dwell_minutes", 10)
            .put("places", JSONArray().put(JSONObject().put("id", "55555555-5555-4555-8555-555555555555")
                .put("name", "Home").put("latitude", 37.0).put("longitude", 127.0).put("radius_meters", 200.0)))
            .put("points", JSONArray()).put("events", JSONArray()).put("stays", JSONArray())
        java.io.File(directory, "history.json").writeText(history.toString())
    }

    @Test fun firstOptInWithEmptyCloudImportsLocalPlacesAndKeepsThem() {
        val context = RuntimeEnvironment.getApplication() as Context
        val cloud = FakeCloud()
        LocationConsent.enable(context, backfill = false, api = cloud)

        assertEquals(1, cloud.places.length())
        assertEquals("Home", cloud.places.getJSONObject(0).getString("name"))
        assertTrue(cloud.actions.contains("put_place"))
        assertEquals(listOf(cloud.places.getJSONObject(0).getString("id")),
            LocationHistoryRepository.get(context).state.value.places.map { it.id })
        assertTrue(LocationConsent.enabled(context))
        assertTrue(LocationConsent.preferences(context).getBoolean("ever_enabled", false))
    }
    @Test fun syncCanBeEnabledAndDisabledWithoutStoppingCollection() {
        val context = RuntimeEnvironment.getApplication() as Context
        val repository = LocationHistoryRepository.get(context)
        repository.startSession()
        try {
            LocationConsent.enable(context, backfill = false, api = FakeCloud())
            assertTrue(LocationConsent.enabled(context))
            // Active collection defers downloaded settings instead of requiring a stop.
            assertFalse(repository.applySyncedPlaces(emptyList(), 20))
            assertEquals("Home", repository.state.value.places.single().name)
            LocationConsent.disable(context)
            assertFalse(LocationConsent.enabled(context))
            assertTrue(LocationConsent.preferences(context).getBoolean("revoke_pending", false))
            assertFalse(repository.applySyncedPlaces(emptyList(), 20))
        } finally { repository.stopSession() }
        assertTrue(repository.applySyncedPlaces(emptyList(), 20))
    }

}
