package com.haptilog.watch.sync

import android.content.Context
import androidx.work.Configuration
import androidx.work.WorkManager
import com.haptilog.watch.data.location.LocationHistoryRepository
import com.haptilog.watch.data.location.SavedPlace
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class LocationConsentTest {
    private class FakeCloud(private var consentEnabled: Boolean) {
        var consentRevision = 0L
        var placesRevision = 0L
        val places = JSONArray()
        val actions = mutableListOf<Pair<String, JSONObject>>()
        var thresholdMinutes = 10
        var failPutNumber: Int? = null
        var puts = 0
        var failNextConsent = false
        fun client() = LocationSyncClient(object : CloudApi {
            override fun authenticate() = "token" to "owner-uuid"
            override fun request(path: String, method: String, body: ByteArray?, token: String?,
                                 contentType: String, extra: Map<String, String>): String {
                val call = JSONObject(String(body!!))
                val action = call.getString("p_action")
                val payload = call.getJSONObject("p_payload")
                actions += action to payload
                when (action) {
                    "consent" -> {
                        if (failNextConsent) { failNextConsent = false; error("Offline") }
                        consentEnabled = payload.getBoolean("enabled")
                        if (consentEnabled) consentRevision++
                    }
                    "put_place" -> {
                        puts++
                        if (puts == failPutNumber) error("Interrupted import")
                        places.put(payload)
                        placesRevision++
                    }
                    "set_threshold" -> thresholdMinutes = payload.getInt("threshold_minutes")
                }
                return JSONObject().put("protocol_version", 1)
                    .put("state", state())
                    .put("places", JSONArray(places.toString()))
                    .put("stays", JSONArray()).put("deleted_ids", JSONArray()).toString()
            }
        })
        fun snapshot() = JSONObject().put("protocol_version", 1).put("state", state())
            .put("places", JSONArray(places.toString())).put("stays", JSONArray())
            .put("deleted_ids", JSONArray())
        private fun state() = JSONObject().put("owner_user_id", "owner-uuid").put("consent_enabled", consentEnabled)
            .put("consent_revision", consentRevision).put("sync_epoch", 0)
            .put("upload_cutoff", if (consentEnabled) "2020-01-01T00:00:00Z" else JSONObject.NULL)
            .put("purged_before", JSONObject.NULL)
            .put("places_revision", placesRevision).put("applied_places_revision", 0)
            .put("threshold_minutes", thresholdMinutes)
    }

    private lateinit var context: Context

    @Before fun setUp() {
        context = RuntimeEnvironment.getApplication() as Context
        // The WorkManager singleton can survive between Robolectric test variants.
        try { WorkManager.getInstance(context) }
        catch (_: IllegalStateException) { WorkManager.initialize(context, Configuration.Builder().build()) }
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().clear().commit()
        LocationConsent.preferences(context).edit().clear().commit()
        // Reset the in-process repository too: replacing its file alone leaves cached places.
        LocationHistoryRepository.get(context).apply {
            stopSession()
            clearHistory()
            state.value.places.forEach { removePlace(it.id) }
            setDwellMinutes(20)
            addPlace(SavedPlace("55555555-5555-4555-8555-555555555555", "Home", 37.0, 127.0, 200.0))
        }
    }

    private fun cloudSync(on: Boolean) {
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", on).putString("consent_version", if (on) CloudConsent.VERSION else null).commit()
    }

    @Test fun sharingFollowsTheCloudSwitchAlone() {
        assertFalse(LocationConsent.enabled(context))
        // Consent on its own is not the switch; both parts of the cloud setting are required.
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .putString("consent_version", CloudConsent.VERSION).commit()
        assertFalse(LocationConsent.enabled(context))
        cloudSync(true)
        assertTrue(LocationConsent.enabled(context))
        cloudSync(false)
        assertFalse(LocationConsent.enabled(context))
    }

    @Test fun agreementBetweenSwitchAndServerSendsNoConsentCall() {
        cloudSync(true)
        // A moved switch leaves the marker; agreement clears it so an idle watch stops waking up.
        LocationConsent.preferences(context).edit().putBoolean("reconcile_pending", true).commit()
        LocationConsent.preferences(context).edit().putBoolean("places_imported", true).commit()
        val cloud = FakeCloud(consentEnabled = true)
        val state = LocationConsent.reconcile(context, cloud.client(), cloud.snapshot())
        assertTrue(state.getBoolean("consent_enabled"))
        assertTrue(cloud.actions.isEmpty())
        assertFalse(LocationConsent.preferences(context).getBoolean("reconcile_pending", false))
    }

    @Test fun cloudSwitchOnPullsTheServerFlagUpAndImportsWatchPlacesOnce() {
        cloudSync(true)
        val cloud = FakeCloud(consentEnabled = false)
        val state = LocationConsent.reconcile(context, cloud.client(), cloud.snapshot())
        assertTrue(state.getBoolean("consent_enabled"))
        // Turning the mirror on also uploads the retained history; nothing is asked of the user.
        assertEquals(listOf("consent", "put_place", "set_threshold"), cloud.actions.map { it.first })
        assertTrue(cloud.actions.first().second.getBoolean("backfill"))
        assertEquals("Home", cloud.places.getJSONObject(0).getString("name"))
        // A brand-new cloud collection inherits the threshold the watch already worked to.
        assertEquals(20, cloud.thresholdMinutes)
        assertTrue(LocationConsent.preferences(context).getBoolean("places_imported", false))

        val second = FakeCloud(consentEnabled = true)
        LocationConsent.reconcile(context, second.client(), second.snapshot())
        assertTrue(second.actions.isEmpty())
    }

    @Test fun cloudSwitchOffWithdrawsTheServerFlag() {
        cloudSync(false)
        LocationConsent.preferences(context).edit().putBoolean("reconcile_pending", true).commit()
        val cloud = FakeCloud(consentEnabled = true)
        LocationConsent.reconcile(context, cloud.client(), cloud.snapshot())
        assertEquals(listOf("consent"), cloud.actions.map { it.first })
        assertFalse(cloud.actions.first().second.getBoolean("enabled"))
        assertFalse(cloud.places.length() > 0)
        assertFalse(LocationConsent.preferences(context).getBoolean("reconcile_pending", false))
    }

    @Test fun partialImportRetriesBeforeApplyingCloudSettings() {
        cloudSync(true)
        val repository = LocationHistoryRepository.get(context)
        repository.addPlace(SavedPlace("66666666-6666-4666-8666-666666666666", "Work", 38.0, 128.0, 200.0))
        val cloud = FakeCloud(consentEnabled = false).apply { failPutNumber = 2 }
        assertThrows(IllegalStateException::class.java) {
            LocationConsent.reconciledSnapshot(context, cloud.client(), cloud.snapshot())
        }
        assertEquals(2, repository.state.value.places.size)
        assertFalse(LocationConsent.preferences(context).getBoolean("places_imported", false))
        val recovered = LocationConsent.reconciledSnapshot(context, cloud.client(), cloud.snapshot())
        assertEquals(2, recovered.getJSONArray("places").length())
        assertEquals(1, cloud.actions.count { it.first == "consent" })
        LocationSyncWorker.syncPlaces(context, repository, cloud.client(), recovered)
        assertEquals(setOf("Home", "Work"), repository.state.value.places.map { it.name }.toSet())
    }

    @Test fun initialImportReturnsMatchingPlacesAndRevisionBeforeAcknowledgement() {
        cloudSync(true)
        val cloud = FakeCloud(consentEnabled = false)
        val before = cloud.snapshot()
        val after = LocationConsent.reconciledSnapshot(context, cloud.client(), before)
        assertEquals(0, before.getJSONArray("places").length())
        assertEquals(1L, after.getJSONObject("state").getLong("places_revision"))
        assertEquals("Home", after.getJSONArray("places").getJSONObject(0).getString("name"))
        val repository = LocationHistoryRepository.get(context)
        LocationSyncWorker.syncPlaces(context, repository, cloud.client(), after)
        assertEquals("Home", repository.state.value.places.single().name)
        assertEquals(1L, LocationConsent.preferences(context).getLong("applied_places_revision", -1))
    }

    @Test fun oldOfflineWithdrawalSurvivesMigrationAndNetworkFailure() {
        cloudSync(false)
        LocationConsent.preferences(context).edit().putBoolean("revoke_pending", true).commit()
        assertTrue(LocationConsent.reconciliationPending(context))
        assertFalse(LocationConsent.preferences(context).contains("revoke_pending"))
        val cloud = FakeCloud(consentEnabled = true).apply { failNextConsent = true }
        assertThrows(IllegalStateException::class.java) {
            LocationConsent.reconcile(context, cloud.client(), cloud.snapshot())
        }
        assertTrue(LocationConsent.reconciliationPending(context))
        val state = LocationConsent.reconcile(context, cloud.client(), cloud.snapshot())
        assertFalse(state.getBoolean("consent_enabled"))
        assertFalse(LocationConsent.reconciliationPending(context))
    }
}
