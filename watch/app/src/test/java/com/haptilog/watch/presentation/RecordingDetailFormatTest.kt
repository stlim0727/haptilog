package com.haptilog.watch.presentation

import com.haptilog.watch.data.RecordingItem
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = android.app.Application::class)
class RecordingDetailFormatTest {
    private fun item(syncStatus: String, attempts: Int = 0, error: String? = null, uploaded: Boolean = false) =
        RecordingItem(
            id = "77777777-7777-4777-8777-777777777777",
            audioFile = File("audio.m4a"),
            metaFile = File("meta.json"),
            startedAtIso = "2026-10-23T05:00:00Z",
            startedAtTimestamp = 1_761_190_800_000L,
            durationSeconds = 42,
            status = "COMPLETED",
            syncStatus = syncStatus,
            syncAttempts = attempts,
            syncError = error,
            uploaded = uploaded
        )

    @Test fun expenseAmountAndMerchantBecomeWristSizedLines() {
        val lines = structuredDataLines(
            "EXPENSE",
            JSONObject().put("amount", 4500).put("currency", "KRW").put("merchant", "카페").put("category", "식비")
        )
        assertEquals(listOf("4,500 KRW", "상인: 카페", "카테고리: 식비"), lines)
    }

    @Test fun unverifiedCurrencyFallsBackToTheBareAmount() {
        val lines = structuredDataLines("EXPENSE", JSONObject().put("amount", 120).put("currency", "krw"))
        assertEquals(listOf("120", "currency: krw"), lines)
    }

    @Test fun memoActionItemsBecomeBullets() {
        val lines = structuredDataLines(
            "MEMO",
            JSONObject().put("action_items", JSONArray().put("장보기").put("전화").put(7)).put("notes", "월요일 전까지")
        )
        assertEquals(listOf("· 장보기", "· 전화", "메모: 월요일 전까지"), lines)
    }

    @Test fun nestedAndUnknownShapesAreSkippedInsteadOfDumped() {
        val lines = structuredDataLines(
            "TRAVEL",
            JSONObject().put("notes", "오사카").put("tags", JSONArray().put("a"))
                .put("itinerary", JSONObject().put("city", "오사카")).put("days", 3)
        )
        assertEquals(listOf("메모: 오사카", "days: 3"), lines)
    }

    @Test fun longObjectsAreCappedForTheRoundScreen() {
        val data = JSONObject()
        ('a'..'h').forEach { data.put(it.toString(), "value") }
        assertEquals(6, structuredDataLines("WORKOUT", data).size)
    }

    @Test fun absentEnrichmentYieldsNoLines() {
        assertTrue(structuredDataLines("MEMO", null).isEmpty())
        assertTrue(structuredDataLines(null, JSONObject()).isEmpty())
    }

    @Test fun syncStatusExplainsStateAttemptsAndError() {
        assertEquals("동기화됨", syncStatusLabel(item("SYNCED")))
        assertEquals("해석 대기", syncStatusLabel(item("PENDING_SYNC", uploaded = true)))
        assertEquals("동기화 대기", syncStatusLabel(item("PENDING_SYNC")))
        assertEquals("확인 필요 · 시도 6회 · CONNECTION_OR_SESSION_ERROR",
            syncStatusLabel(item("ACTION_REQUIRED", attempts = 6, error = "CONNECTION_OR_SESSION_ERROR")))
        assertEquals("대기", syncStatusLabel(item("")))
    }

    @Test fun shouldTrashCloudCopyOnlyWhenInCloudAndConfigured() {
        // Uploaded item with cloud configured must trash cloud copy
        assertTrue(shouldTrashCloudCopy(item("PENDING_SYNC", uploaded = true), cloudConfigured = true))
        assertTrue(shouldTrashCloudCopy(item("SYNCED", uploaded = false), cloudConfigured = true))
        assertTrue(shouldTrashCloudCopy(item("SYNCING", uploaded = false), cloudConfigured = true))

        // Not in cloud must not trash cloud copy
        assertFalse(shouldTrashCloudCopy(item("PENDING_SYNC", uploaded = false), cloudConfigured = true))
        assertFalse(shouldTrashCloudCopy(item("CAPTURE_FAILED", uploaded = false), cloudConfigured = true))

        // When cloud is not configured, always local only
        assertFalse(shouldTrashCloudCopy(item("SYNCED", uploaded = true), cloudConfigured = false))
    }
}
