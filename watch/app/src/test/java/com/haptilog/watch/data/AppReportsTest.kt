package com.haptilog.watch.data

import android.content.Context
import com.haptilog.watch.support.AppReports
import com.haptilog.watch.sync.CloudApi
import com.haptilog.watch.sync.CloudException
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = android.app.Application::class)
class AppReportsTest {
    private lateinit var context: Context
    private class FakeCloud(var fail: Int = 0, var code: String? = null, val afterRequest: () -> Unit = {}) : CloudApi {
        var report: JSONObject? = null
        override fun authenticate() = "private-token" to "owner"
        override fun request(path: String, method: String, body: ByteArray?, token: String?, contentType: String, extra: Map<String, String>): String {
            assertEquals("/rest/v1/app_reports", path)
            assertEquals("return=minimal", extra["Prefer"])
            report = JSONObject(String(body!!))
            if (fail != 0) throw CloudException(fail, code)
            afterRequest()
            return ""
        }
    }
    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        File(context.filesDir, "support_reports").deleteRecursively()
        context.getSharedPreferences("support", Context.MODE_PRIVATE).edit().clear().commit()
    }
    @Test fun crashReportingDefaultsOffAndNeverCapturesMessagesOrForeignFrames() {
        val error = IllegalStateException("secret transcript GPS token")
        error.stackTrace = arrayOf(
            StackTraceElement("com.haptilog.watch.Capture", "save", "secret-path.m4a", 42),
            StackTraceElement("private.user.Email", "email", "private", 1))
        assertNull(AppReports.save(context, "crash", error = error))
        AppReports.setCrashReportsEnabled(context, true)
        AppReports.save(context, "crash", error = error)
        val client = FakeCloud()
        AppReports.upload(context, client)
        val text = client.report.toString()
        assertTrue(text.contains("Capture.save:42"))
        listOf("secret", "transcript", "GPS", "token", "private.user", "m4a").forEach { assertFalse(text.contains(it)) }
        assertEquals(0, AppReports.pending(context))
    }
    @Test fun failedUploadPreservesReportAndRetriesSameIdentity() {
        val id = AppReports.save(context, "issue", "Sync is stuck")
        val client = FakeCloud(503)
        try { AppReports.upload(context, client); fail("must fail") } catch (_: CloudException) {}
        assertEquals(1, AppReports.pending(context))
        client.fail = 0
        AppReports.upload(context, client)
        assertEquals(id, client.report!!.getString("id"))
        assertEquals("owner", client.report!!.getString("user_id"))
        assertEquals(0, AppReports.pending(context))
    }
    @Test fun duplicateAcknowledgementIsIdempotent() {
        AppReports.save(context, "issue", "Test")
        AppReports.upload(context, FakeCloud(409, "23505"))
        assertEquals(0, AppReports.pending(context))
    }
    @Test fun foreignKeyAndUnclassifiedConflictsKeepTheLocalCopy() {
        AppReports.save(context, "issue", "Keep this report")
        for (code in listOf("23503", null)) {
            try { AppReports.upload(context, FakeCloud(409, code)); fail("must preserve conflict") } catch (_: CloudException) {}
            assertEquals(1, AppReports.pending(context))
        }
    }
    @Test fun captureStartingDuringUploadPausesBeforeTheNextReport() {
        AppReports.save(context, "issue", "First")
        AppReports.save(context, "issue", "Second")
        var recording = false
        try {
            AppReports.upload(context, FakeCloud(afterRequest = { recording = true })) { !recording }
            fail("must pause")
        } catch (_: com.haptilog.watch.support.ReportUploadPaused) {}
        assertEquals(1, AppReports.pending(context))
        AppReports.upload(context, FakeCloud()) { true }
        assertEquals(0, AppReports.pending(context))
    }
    @Test fun reportsAddedDuringUploadRemainAvailableToSuccessor() {
        AppReports.save(context, "issue", "First")
        AppReports.upload(context, FakeCloud(afterRequest = { AppReports.save(context, "issue", "Added during upload") }))
        assertEquals(1, AppReports.pending(context))
        val successor = FakeCloud()
        AppReports.upload(context, successor)
        assertEquals("Added during upload", successor.report!!.getString("description"))
        assertEquals(0, AppReports.pending(context))
    }
    @Test fun cancelledOrCaptureBlockedClientCannotStartNetworkRequests() {
        val cancelled = com.haptilog.watch.sync.CloudClient(context)
        cancelled.cancelRequests()
        for (client in listOf(cancelled, com.haptilog.watch.sync.CloudClient(context) { false })) {
            try { client.request("/rest/v1/app_reports", "POST"); fail("must not start request") }
            catch (_: java.io.IOException) {}
        }
    }
    @Test fun disablingDeletesOnlyUnsentCrashesAndRetainsManualIssues() {
        AppReports.setCrashReportsEnabled(context, true)
        AppReports.save(context, "crash", error = Exception("private"))
        AppReports.save(context, "issue", "Manual")
        AppReports.setCrashReportsEnabled(context, false)
        assertEquals(1, AppReports.pending(context))
        val client = FakeCloud()
        AppReports.upload(context, client)
        assertEquals("issue", client.report!!.getString("kind"))
    }
    @Test fun queueIsBoundedWithoutDeletingRecordings() {
        val recording = File(context.filesDir, "keep.m4a").apply { writeText("source") }
        repeat(10) { AppReports.save(context, "issue", "Test") }
        try { AppReports.save(context, "issue", "Overflow"); fail("queue must be bounded") } catch (_: IllegalStateException) {}
        assertEquals("source", recording.readText())
    }
    @Test fun crashHandlerPersistsMinimalReportAndDelegatesToAndroidHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        var delegated = false
        try {
            Thread.setDefaultUncaughtExceptionHandler { _, _ -> delegated = true }
            AppReports.setCrashReportsEnabled(context, true)
            AppReports.install(context)
            Thread.getDefaultUncaughtExceptionHandler()!!.uncaughtException(Thread.currentThread(), RuntimeException("sensitive"))
            assertTrue(delegated)
            assertEquals(1, AppReports.pending(context))
        } finally { Thread.setDefaultUncaughtExceptionHandler(previous) }
    }
}
