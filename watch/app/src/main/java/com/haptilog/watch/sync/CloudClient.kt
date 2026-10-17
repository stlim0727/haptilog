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

class CloudException(val status: Int, val databaseCode: String? = null) : Exception("Cloud request failed ($status)")
class AuthSessionException : Exception("Stored session cannot be opened")

/** Small REST client: no privileged key is ever included in the watch build. */
interface CloudApi {
    fun authenticate(): Pair<String, String>
    fun request(path: String, method: String, body: ByteArray? = null, token: String? = null,
                contentType: String = "application/json", extra: Map<String, String> = emptyMap()): String
}

class CloudClient(context: Context, private val requestsAllowed: () -> Boolean = { true }) : CloudApi {
    @Volatile private var activeConnection: HttpURLConnection? = null
    @Volatile private var cancelled = false
    fun cancelRequests() {
        cancelled = true
        activeConnection?.disconnect()
    }
    private fun requireAllowed() {
        if (cancelled || !requestsAllowed()) throw java.io.IOException("Cloud request paused")
    }
    private val prefs = context.getSharedPreferences("cloud_session", Context.MODE_PRIVATE)
    private val url = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val apiKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY

    companion object {
        private val sessionLock = Any()
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
    }
    override fun authenticate(): Pair<String, String> = synchronized(sessionLock) {
        check(configured)
        val old = try { readSession() } catch (_: Exception) { throw AuthSessionException() }
        val next = when {
            old == null -> JSONObject(request("/auth/v1/signup", "POST", "{}".toByteArray()))
            old.optLong("expires_at") <= System.currentTimeMillis() / 1000 + 60 -> JSONObject(request(
                "/auth/v1/token?grant_type=refresh_token", "POST",
                JSONObject().put("refresh_token", old.getString("refresh_token")).toString().toByteArray()))
            else -> old
        }
        if (!next.has("expires_at")) next.put("expires_at", System.currentTimeMillis() / 1000 + next.getLong("expires_in"))
        if (next !== old) persist(next)
        next.getString("access_token") to next.getJSONObject("user").getString("id")
    }
    override fun request(path: String, method: String, body: ByteArray?, token: String?,
                contentType: String, extra: Map<String, String>): String {
        requireAllowed()
        val connection = URL(url + path).openConnection() as HttpURLConnection
        try {
            activeConnection = connection
            requireAllowed()
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 90_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("apikey", apiKey)
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", contentType)
            extra.forEach { (key, value) -> connection.setRequestProperty(key, value) }
            if (body != null) {
                requireAllowed()
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(body.size)
                connection.outputStream.use { it.write(body) }
            }
            requireAllowed()
            val code = connection.responseCode
            if (code !in 200..299) {
                // Keep only the structured error code, never server messages/details.
                val databaseCode = runCatching {
                    val error = connection.errorStream?.bufferedReader()?.use { reader ->
                        buildString {
                            repeat(4096) {
                                val next = reader.read()
                                if (next == -1) return@buildString
                                append(next.toChar())
                            }
                        }
                    }
                    error?.let { JSONObject(it).optString("code").takeIf { value -> value.matches(Regex("[A-Z0-9]{5,16}")) } }
                }.getOrNull()
                throw CloudException(code, databaseCode)
            }
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally { activeConnection = null; connection.disconnect() }
    }
}
