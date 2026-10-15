package com.haptilog.watch.sync

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.haptilog.watch.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class CloudException(val status: Int) : Exception("Cloud request failed ($status)")
class AuthSessionException : Exception("Stored session cannot be opened")

/** Small REST client: no privileged key is ever included in the watch build. */
interface CloudApi {
    fun authenticate(): Pair<String, String>
    fun request(path: String, method: String, body: ByteArray? = null, token: String? = null,
                contentType: String = "application/json", extra: Map<String, String> = emptyMap()): String
}

class CloudClient(context: Context) : CloudApi {
    private val prefs = context.getSharedPreferences("cloud_session", Context.MODE_PRIVATE)
    private val url = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val apiKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY
    private var session: JSONObject? = try { readSession() } catch (_: Exception) { throw AuthSessionException() }

    companion object {
        val configured get() = BuildConfig.SUPABASE_URL.startsWith("https://") && BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("haptilog_session", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("haptilog_session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun readSession(): JSONObject? {
        val encoded = prefs.getString("session", null) ?: return null
        // Fail closed on lost/corrupt credentials rather than silently changing owner.
        val parts = encoded.split(':')
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
        return JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
    }
    private fun persist(value: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encoded = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(cipher.doFinal(value.toString().toByteArray()), Base64.NO_WRAP)
        check(prefs.edit().putString("session", encoded).commit())
        session = value
    }
    override fun authenticate(): Pair<String, String> {
        check(configured)
        val old = session
        val next = when {
            old == null -> JSONObject(request("/auth/v1/signup", "POST", "{}".toByteArray()))
            old.optLong("expires_at") <= System.currentTimeMillis() / 1000 + 60 -> JSONObject(request(
                "/auth/v1/token?grant_type=refresh_token", "POST",
                JSONObject().put("refresh_token", old.getString("refresh_token")).toString().toByteArray()))
            else -> old
        }
        if (!next.has("expires_at")) next.put("expires_at", System.currentTimeMillis() / 1000 + next.getLong("expires_in"))
        if (next !== old) persist(next)
        return next.getString("access_token") to next.getJSONObject("user").getString("id")
    }
    override fun request(path: String, method: String, body: ByteArray?, token: String?,
                contentType: String, extra: Map<String, String>): String {
        val connection = URL(url + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 90_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("apikey", apiKey)
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", contentType)
            extra.forEach { (key, value) -> connection.setRequestProperty(key, value) }
            if (body != null) {
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(body.size)
                connection.outputStream.use { it.write(body) }
            }
            val code = connection.responseCode
            if (code !in 200..299) throw CloudException(code)
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally { connection.disconnect() }
    }
}
