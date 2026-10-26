package com.haptilog.watch.sync

import android.content.Context
import androidx.work.Configuration
import androidx.work.WorkManager
import com.haptilog.watch.data.location.LocationHistoryRepository
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class LocationConsentTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()
    private class FakeCloud(val fail: Boolean = false) : CloudApi {
        val requests = mutableListOf<JSONObject>()
        override fun authenticate() = "token" to "owner-uuid"
        override fun request(path: String, method: String, body: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String {
            assertEquals("/rest/v1/rpc/set_unified_cloud_consent", path)
            requests += JSONObject(String(body!!))
            if (fail) throw CloudException(409)
            return ""
        }
    }
    @Before fun setUp() {
        try { WorkManager.getInstance(context) }
        catch (_: IllegalStateException) { WorkManager.initialize(context, Configuration.Builder().build()) }
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit().clear().commit()
        LocationConsent.preferences(context).edit().clear().commit()
        val repository = LocationHistoryRepository.get(context)
        repository.stopSession()
        repository.state.value.places.forEach { repository.removePlace(it.id) }
        repository.addPlace(com.haptilog.watch.data.location.SavedPlace("55555555-5555-4555-8555-555555555555", "Home", 37.0, 127.0, 200.0))
    }
    @Test fun firstOptInImportsPlacesAndEnablesBothThroughOneRpc() {
        val api = FakeCloud()
        CloudConsent.enable(context, api)
        assertEquals(1, api.requests.size)
        val request = api.requests.single()
        assertEquals("Home", request.getJSONArray("p_places").getJSONObject(0).getString("name"))
        assertEquals(CloudConsent.VERSION, request.getString("p_policy_version"))
        assertTrue(RecordingSyncWorker.enabled(context))
        assertTrue(LocationConsent.enabled(context))
    }
    @Test fun failedTransactionDoesNotEnableEitherUploadWorker() {
        assertThrows(CloudException::class.java) { CloudConsent.enable(context, FakeCloud(true)) }
        assertFalse(RecordingSyncWorker.enabled(context))
        assertFalse(LocationConsent.enabled(context))
        assertFalse(LocationConsent.preferences(context).getBoolean("ever_enabled", false))
    }
    @Test fun laterEnableUsesCloudPlacesAndDisableDoesNotStopCollection() {
        val repo = LocationHistoryRepository.get(context)
        repo.startSession()
        try {
            CloudConsent.enable(context, FakeCloud())
            CloudConsent.disable(context)
            assertFalse(RecordingSyncWorker.enabled(context))
            assertFalse(LocationConsent.enabled(context))
            assertFalse(repo.applySyncedPlaces(emptyList(), 20))
            val api = FakeCloud()
            CloudConsent.enable(context, api)
            assertTrue(api.requests.single().isNull("p_places"))
        } finally { repo.stopSession() }
    }
    @Test fun delayedServerWithdrawalCannotUndoNewerExplicitEnable() {
        CloudConsent.enable(context, FakeCloud())
        val oldGeneration = CloudConsent.generation(context)
        CloudConsent.disable(context)
        CloudConsent.enable(context, FakeCloud())
        CloudConsent.observeWithdrawal(context, oldGeneration)
        assertTrue(RecordingSyncWorker.enabled(context))
        CloudConsent.observeWithdrawal(context, CloudConsent.generation(context))
        assertFalse(RecordingSyncWorker.enabled(context))
        assertFalse(LocationConsent.enabled(context))
    }
    @Test fun oldIndependentConsentsNeverAuthorizeTheExpandedScope() {
        context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", true).putString("consent_version", "2026-10-18").commit()
        LocationConsent.preferences(context).edit().putBoolean("enabled", true)
            .putString("policy_version", "2026-10-26").commit()
        assertFalse(RecordingSyncWorker.enabled(context))
        assertFalse(LocationConsent.enabled(context))
    }
}
