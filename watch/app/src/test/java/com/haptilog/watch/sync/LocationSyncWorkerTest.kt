package com.haptilog.watch.sync

import android.app.Application
import android.content.Context
import com.haptilog.watch.data.location.LocationHistoryRepository
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.nio.file.Files

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class LocationSyncWorkerTest {
    private lateinit var context: Context
    private lateinit var repository: LocationHistoryRepository
    private val owner = "11111111-1111-4111-8111-111111111111"
    private val place = "22222222-2222-4222-8222-222222222222"

    private class FakeCloud : CloudApi {
        val acknowledgements = mutableListOf<Long>()
        override fun authenticate() = "token" to "owner"
        override fun request(path: String, method: String, body: ByteArray?, token: String?,
                             contentType: String, extra: Map<String, String>): String {
            val call = JSONObject(String(body!!))
            assertEquals("apply_places", call.getString("p_action"))
            acknowledgements += call.getJSONObject("p_payload").getLong("revision")
            return "{}"
        }
    }

    @Before fun setUp() {
        context = RuntimeEnvironment.getApplication()
        LocationConsent.preferences(context).edit().clear().commit()
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().clear()
            .putBoolean("enabled", true).putString("consent_version", CloudConsent.VERSION).commit()
        repository = LocationHistoryRepository(Files.createTempDirectory("location-sync-worker").toFile())
    }

    private fun snapshot(revision: Long = 4, applied: Long = 0, who: String = owner,
                         name: String = "Office", consent: Long = 1, epoch: Long = 0) = JSONObject()
        .put("state", JSONObject().put("owner_user_id", who).put("places_revision", revision)
            .put("applied_places_revision", applied).put("threshold_minutes", 20)
            .put("consent_revision", consent).put("sync_epoch", epoch))
        .put("places", JSONArray().put(JSONObject().put("id", place).put("name", name)
            .put("latitude", 37.5).put("longitude", 127.0).put("radius_meters", 200)))

    @Test fun nextStartApplicationIsAcknowledgedDuringActiveSession() {
        val cloud = FakeCloud()
        val client = LocationSyncClient(cloud)
        repository.startSession()
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        assertTrue(cloud.acknowledgements.isEmpty())
        assertTrue(repository.state.value.places.isEmpty())

        repository.stopSession()
        // The service applies pending settings before creating its next detector.
        assertEquals(4L, LocationSyncWorker.applyPending(context, repository))
        repository.startSession()
        assertEquals("Office", repository.state.value.places.single().name)
        assertEquals(20, repository.state.value.dwellMinutes)
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        assertEquals(listOf(4L), cloud.acknowledgements)
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot(applied = 4))
        assertEquals(listOf(4L), cloud.acknowledgements)
    }

    @Test fun newerDesiredSettingsAreNotAcknowledgedBeforeApplication() {
        val cloud = FakeCloud()
        val client = LocationSyncClient(cloud)
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        cloud.acknowledgements.clear()
        repository.startSession()
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot(revision = 5, name = "New office"))
        assertTrue(cloud.acknowledgements.isEmpty())
        assertEquals("Office", repository.state.value.places.single().name)
    }

    @Test fun ownerOrContentResetCannotReuseBareRevision() {
        val cloud = FakeCloud()
        val client = LocationSyncClient(cloud)
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        cloud.acknowledgements.clear()
        repository.startSession()
        LocationSyncWorker.syncPlaces(context, repository, client,
            snapshot(who = "33333333-3333-4333-8333-333333333333"))
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot(name = "Different same revision"))
        assertTrue(cloud.acknowledgements.isEmpty())
    }

    @Test fun lostApplicationProofRequiresApplicationRatherThanHistoricalNumber() {
        val cloud = FakeCloud()
        val client = LocationSyncClient(cloud)
        LocationConsent.preferences(context).edit().putLong("applied_places_revision", 4).commit()
        repository.startSession()
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        assertTrue(cloud.acknowledgements.isEmpty())
        repository.stopSession()
        LocationSyncWorker.applyPending(context, repository)
        repository.startSession()
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        assertEquals(listOf(4L), cloud.acknowledgements)
    }

    @Test fun repositoryReinitializationDoesNotReuseProofForMissingSettings() {
        val cloud = FakeCloud()
        val client = LocationSyncClient(cloud)
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        cloud.acknowledgements.clear()
        val reset = LocationHistoryRepository(Files.createTempDirectory("location-sync-reset").toFile())
        reset.startSession()
        LocationSyncWorker.syncPlaces(context, reset, client, snapshot())
        assertTrue(cloud.acknowledgements.isEmpty())
    }

    @Test fun stayEpochAndConsentTokenDoNotInvalidateIdenticalAppliedPlaces() {
        val cloud = FakeCloud()
        val client = LocationSyncClient(cloud)
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        cloud.acknowledgements.clear()
        repository.startSession()
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot(consent = 3, epoch = 8))
        assertEquals(listOf(4L), cloud.acknowledgements)
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().putBoolean("enabled", false).commit()
        cloud.acknowledgements.clear()
        LocationSyncWorker.syncPlaces(context, repository, client, snapshot())
        assertTrue(cloud.acknowledgements.isEmpty())
    }
}
