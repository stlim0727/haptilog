package com.haptilog.watch.support

import android.content.Context
import android.os.Build
import android.util.AtomicFile
import com.haptilog.watch.BuildConfig
import com.haptilog.watch.sync.CloudApi
import com.haptilog.watch.sync.CloudException
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** A bounded private queue, entirely separate from recordings and their sync state. */
object AppReports {
    private val lock = Any()
    private fun prefs(context: Context) = context.getSharedPreferences("support", Context.MODE_PRIVATE)
    fun crashReportsEnabled(context: Context) = prefs(context).getBoolean("crashes", false)
    private fun dir(context: Context) = File(context.filesDir, "support_reports").apply { mkdirs() }
    private fun files(context: Context) = dir(context).listFiles().orEmpty().filter { it.extension == "json" }.sortedBy { it.name }
    fun pending(context: Context) = synchronized(lock) { files(context).size }

    fun setCrashReportsEnabled(context: Context, enabled: Boolean) = synchronized(lock) {
        check(prefs(context).edit().putBoolean("crashes", enabled).commit())
        if (!enabled) files(context).forEach { file ->
            if (runCatching { JSONObject(file.readText()).optString("kind") == "crash" }.getOrDefault(false)) file.delete()
        }
    }

    fun diagnostics(error: Throwable? = null): JSONObject {
        val result = JSONObject()
            .put("version", BuildConfig.VERSION_NAME).put("build", BuildConfig.VERSION_CODE)
            .put("android_api", Build.VERSION.SDK_INT).put("device", "${Build.MANUFACTURER} ${Build.MODEL}".take(120))
        if (error != null) {
            // Never serialize exception messages, cause messages, local paths, or thread names.
            val causes = JSONArray()
            var current: Throwable? = error
            repeat(4) {
                current?.let { cause ->
                    val frames = JSONArray()
                    cause.stackTrace.filter { it.className.startsWith("com.haptilog.watch.") }.take(8).forEach { frame ->
                        frames.put("${frame.className.take(100)}.${frame.methodName.take(50)}:${frame.lineNumber}")
                    }
                    causes.put(JSONObject().put("type", cause.javaClass.name.take(160)).put("frames", frames))
                    current = cause.cause.takeUnless { it === cause }
                }
            }
            result.put("exceptions", causes)
        }
        return result
    }

    fun save(context: Context, kind: String, description: String = "", error: Throwable? = null): String? = synchronized(lock) {
        require(kind in listOf("issue", "crash"))
        require(description.length <= 1000)
        if (kind == "crash" && !crashReportsEnabled(context)) return null
        check(files(context).size < 10) { "Report queue is full" }
        val id = UUID.randomUUID().toString()
        val value = JSONObject().put("id", id).put("kind", kind).put("description", description)
            .put("diagnostics", diagnostics(error))
        val file = AtomicFile(File(dir(context), "$id.json"))
        val output = file.startWrite()
        try {
            output.write(value.toString().toByteArray(Charsets.UTF_8))
            file.finishWrite(output)
        } catch (failure: Throwable) {
            file.failWrite(output)
            throw failure
        }
        id
    }

    fun upload(context: Context, client: CloudApi) {
        val queue = synchronized(lock) { files(context) }
        for (file in queue) {
            val report = synchronized(lock) {
                if (file.exists()) JSONObject(file.readText()) else null
            } ?: continue
            if (report.getString("kind") == "crash" && !crashReportsEnabled(context)) {
                file.delete()
                continue
            }
            val (token, owner) = client.authenticate()
            report.put("user_id", owner)
            try {
                client.request("/rest/v1/app_reports", "POST", report.toString().toByteArray(), token,
                    extra = mapOf("Prefer" to "return=minimal"))
            } catch (failure: CloudException) {
                // A retry after an acknowledged insert lost its response is idempotent.
                if (failure.status != 409) throw failure
            }
            synchronized(lock) { if (file.exists()) check(file.delete()) }
        }
    }

    fun install(context: Context) {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try { runCatching { save(context, "crash", error = error) } }
            finally {
                // Preserve Android's crash handling. No network or WorkManager calls here.
                if (previous != null) previous.uncaughtException(thread, error)
                else {
                    android.os.Process.killProcess(android.os.Process.myPid())
                    kotlin.system.exitProcess(10)
                }
            }
        }
    }
}
