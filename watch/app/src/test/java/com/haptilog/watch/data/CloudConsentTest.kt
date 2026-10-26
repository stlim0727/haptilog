package com.haptilog.watch.data

import android.content.Context
import com.haptilog.watch.sync.CloudApi
import com.haptilog.watch.sync.CloudConsent
import com.haptilog.watch.sync.RecordingSyncWorker
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = android.app.Application::class)
class CloudConsentTest {
    @Test fun legacyOptInDoesNotAuthorizeNewDisclosure() {
        val context = RuntimeEnvironment.getApplication()
        val prefs = context.getSharedPreferences("cloud_options", Context.MODE_PRIVATE)
        prefs.edit().clear().putBoolean("enabled", true).commit()
        assertFalse(RecordingSyncWorker.enabled(context))
        prefs.edit().putString("consent_version", CloudConsent.VERSION).commit()
        assertTrue(RecordingSyncWorker.enabled(context))
        prefs.edit().putBoolean("enabled", false).commit()
        assertFalse(RecordingSyncWorker.enabled(context))
    }
    @Test fun withdrawalUsesAuthenticatedServerRpcWithoutAudio() {
        var body: JSONObject? = null
        val client = object : CloudApi {
            override fun authenticate() = "verified-token" to "watch-owner"
            override fun request(path: String, method: String, bytes: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String {
                assertEquals("/rest/v1/rpc/set_unified_cloud_consent", path)
                assertEquals("verified-token", token)
                body = JSONObject(String(bytes!!))
                return ""
            }
        }
        CloudConsent.send(client, false)
        assertFalse(body!!.getBoolean("p_enabled"))
        assertFalse(body!!.getBoolean("p_adult"))
        assertEquals(CloudConsent.VERSION, body!!.getString("p_policy_version"))
    }
}
