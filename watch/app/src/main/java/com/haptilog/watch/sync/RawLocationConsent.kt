package com.haptilog.watch.sync

import android.content.Context
import org.json.JSONObject

/** Explicit scope upgrade; old combined consent never grants precise raw uploads. */
object RawLocationConsent {
    const val VERSION = "2026-10-27-raw-location"
    private fun prefs(context: Context) = context.getSharedPreferences("raw_location_consent", Context.MODE_PRIVATE)
    fun grant(context: Context): JSONObject? = if (LocationConsent.enabled(context))
        prefs(context).getString("grant", null)?.let(::JSONObject) else null
    fun clear(context: Context) { check(prefs(context).edit().remove("grant").commit()) }
    fun enable(context: Context, api: CloudApi = CloudClient(context)) {
        check(LocationConsent.enabled(context))
        val generation = CloudConsent.generation(context)
        val client = RawLocationClient(api)
        val result = client.call("consent", JSONObject().put("policy_version", VERSION).put("adult", true))
        check(LocationConsent.enabled(context) && generation == CloudConsent.generation(context))
        val grant = JSONObject().put("owner", client.owner).put("consent_id", result.getString("consent_id"))
        check(prefs(context).edit().putString("grant", grant.toString()).commit())
        RawLocationSyncWorker.schedule(context)
    }
}

class RawLocationClient(private val api: CloudApi) {
    private val credentials by lazy { api.authenticate() }
    val owner get() = credentials.second
    fun call(action: String, payload: JSONObject = JSONObject()): JSONObject {
        val (token, owner) = credentials
        val result = JSONObject(api.request("/rest/v1/rpc/raw_locations", "POST", JSONObject()
            .put("p_owner", owner).put("p_action", action).put("p_payload", payload).toString().toByteArray(), token))
        if (result.has("error")) throw LocationSyncException(result.getString("error"))
        check(result.getInt("protocol_version") == 1)
        return result
    }
}
