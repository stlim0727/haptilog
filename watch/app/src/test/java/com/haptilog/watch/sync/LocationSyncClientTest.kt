package com.haptilog.watch.sync

import com.haptilog.watch.data.location.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LocationSyncClientTest {
    private fun stay() = LocationStay(
        id = "11111111-1111-4111-8111-111111111111", sessionId = "22222222-2222-4222-8222-222222222222",
        startedAtMillis = 1_000_000, qualifiedAtMillis = 1_600_000, lastObservedAtMillis = 1_660_000,
        observedDurationMillis = 660_000, representativeLatitude = 37.5, representativeLongitude = 127.0,
        accuracyMeters = 10f,
    )

    @Test fun wireAllowsOnlySummaryAndMapsStopReasons() {
        val json = LocationStayWire.encode(stay().closed(LocationStayEndReason.PERMISSION_LOST, 1_700_000))
        assertEquals("stopped", json.getString("end_reason"))
        assertEquals("closed", json.getString("status"))
        assertEquals("1970-01-01T00:27:40Z", json.getString("last_observed_at"))
        assertEquals(660_000, json.getLong("observed_duration_millis"))
        assertFalse(json.has("points"))
        assertFalse(json.has("sample"))
        assertFalse(json.has("elapsedRealtimeMillis"))
        assertFalse(json.has("place_name"))
        assertEquals(16, json.length())
    }

    @Test fun discontinuousClockNeverUploads() {
        assertThrows(IllegalArgumentException::class.java) {
            LocationStayWire.encode(stay().copy(clockDiscontinuity = true))
        }
    }

    @Test fun rpcUsesAuthenticatedOwnerAndPropagatesStructuredConflict() {
        var seen = JSONObject()
        val api = object : CloudApi {
            override fun authenticate() = "token" to "watch-owner"
            override fun request(path: String, method: String, body: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String {
                assertEquals("/rest/v1/rpc/location_stays", path)
                assertEquals("POST", method)
                assertEquals("token", token)
                seen = JSONObject(String(body!!))
                return "{\"error\":\"EPOCH_CONFLICT\"}"
            }
        }
        val error = assertThrows(LocationSyncException::class.java) { LocationSyncClient(api).call("snapshot") }
        assertEquals("EPOCH_CONFLICT", error.error)
        assertEquals("watch-owner", seen.getString("p_owner"))
        assertEquals("snapshot", seen.getString("p_action"))
    }

    private fun stateCloud(consentEnabled: Boolean, revision: Long) = object : CloudApi {
        override fun authenticate() = "token" to "watch-owner"
        override fun request(path: String, method: String, body: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String =
            JSONObject().put("protocol_version", 1).put("state", JSONObject()
                .put("consent_enabled", consentEnabled).put("consent_revision", revision))
                .put("places", JSONArray()).put("stays", JSONArray()).put("deleted_ids", JSONArray()).toString()
    }

    @Test fun webReEnableAdoptsBumpedConsentToken() {
        val client = LocationSyncClient(stateCloud(consentEnabled = true, revision = 7))
        client.ensureConsentCurrent()
        assertEquals(7L, client.consentRevision)
    }

    @Test fun consentRevocationNeverBridges() {
        val client = LocationSyncClient(stateCloud(consentEnabled = false, revision = 7))
        val error = assertThrows(LocationSyncException::class.java) { client.ensureConsentCurrent() }
        assertEquals("CONSENT_REQUIRED", error.error)
    }
}
