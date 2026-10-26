package com.haptilog.watch.sync

import android.content.Context
import androidx.work.*
import com.haptilog.watch.data.location.LocationHistoryRepository
import com.haptilog.watch.data.location.SavedPlace
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Separate scheduling: a watch with no audio consent or recordings still syncs places. */
class LocationSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        private val mutex = Mutex()
        @Volatile private var active: CloudClient? = null
        fun cancelActive() { active?.cancelRequests() }
        fun schedule(context: Context) {
            val prefs = LocationConsent.preferences(context)
            if ((!LocationConsent.enabled(context) && !prefs.getBoolean("revoke_pending", false)) || !CloudClient.configured) return
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true).build()
            val manager = WorkManager.getInstance(context)
            manager.enqueueUniqueWork("location-sync", ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<LocationSyncWorker>().setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
            manager.enqueueUniquePeriodicWork("location-sync-safety", ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<LocationSyncWorker>(15, TimeUnit.MINUTES)
                    .setConstraints(constraints).build())
        }

        /** Only downloaded, consented settings; active sessions defer application atomically. */
        fun applyPending(context: Context, repository: LocationHistoryRepository): Long? {
            if (!LocationConsent.enabled(context)) return null
            val raw = LocationConsent.preferences(context).getString("pending_places", null) ?: return null
            val pending = JSONObject(raw)
            val places = pending.getJSONArray("places")
            val parsed = (0 until places.length()).map { index ->
                val place = places.getJSONObject(index)
                SavedPlace(place.getString("id"), place.getString("name"), place.getDouble("latitude"),
                    place.getDouble("longitude"), place.getDouble("radius_meters"))
            }
            if (!repository.applySyncedPlaces(parsed, pending.getInt("threshold_minutes"))) return null
            check(LocationConsent.preferences(context).edit()
                .putLong("applied_places_revision", pending.getLong("revision")).commit())
            return pending.getLong("revision")
        }
    }

    override suspend fun doWork(): Result = mutex.withLock { withContext(Dispatchers.IO) {
        val context = applicationContext
        val prefs = LocationConsent.preferences(context)
        if (!CloudClient.configured || (!LocationConsent.enabled(context) && !prefs.getBoolean("revoke_pending", false)))
            return@withContext Result.success()
        // Do not compete with the sacred audio capture path.
        if (com.haptilog.watch.service.VoiceRecordingService.isRecording.value) return@withContext Result.retry()
        val api = CloudClient(context) { !isStopped && (LocationConsent.enabled(context) || prefs.getBoolean("revoke_pending", false)) }
        active = api
        try {
            val client = LocationSyncClient(api)
            val snapshot = client.call("snapshot")
            val state = snapshot.getJSONObject("state")
            check(snapshot.getInt("protocol_version") == 1)
            if (prefs.getBoolean("revoke_pending", false)) {
                client.call("consent", JSONObject().put("enabled", false).put("backfill", false)
                    .put("expected_revision", state.getLong("consent_revision")))
                check(prefs.edit().putBoolean("revoke_pending", false).remove("pending_places").commit())
                return@withContext Result.success()
            }
            if (!LocationConsent.enabled(context)) return@withContext Result.success()
            if (!state.getBoolean("consent_enabled")) {
                check(prefs.edit().putBoolean("enabled", false).remove("checkpoint").remove("pending_places").commit())
                return@withContext Result.success()
            }
            val epoch = state.getLong("sync_epoch")
            val previous = JSONObject(prefs.getString("checkpoint", "{}")!!)
            val acknowledgements = if (previous.optLong("epoch", -1) == epoch)
                previous.optJSONObject("acknowledgements") ?: JSONObject() else JSONObject()
            val deleted = snapshot.getJSONArray("deleted_ids")
            val deletedIds = (0 until deleted.length()).map { deleted.getString(it) }.toSet()
            // Apply the complete deletion snapshot before any outbox can adopt the new epoch.
            fun checkpoint() = JSONObject().put("epoch", epoch).put("deleted_ids", deleted)
                .put("acknowledgements", acknowledgements)
            check(prefs.edit().putString("checkpoint", checkpoint().toString()).commit())
            val repository = LocationHistoryRepository.get(context)
            val pending = JSONObject().put("revision", state.getLong("places_revision"))
                .put("threshold_minutes", state.getInt("threshold_minutes"))
                .put("places", snapshot.getJSONArray("places"))
            check(prefs.edit().putString("pending_places", pending.toString()).commit())
            val applied = applyPending(context, repository)
            if (applied != null && applied != state.getLong("applied_places_revision")) {
                client.call("apply_places", JSONObject().put("revision", applied))
            }
            val cutoff = Instant.parse(state.getString("upload_cutoff")).toEpochMilli()
            val purgedBefore = state.optString("purged_before").takeUnless { it.isBlank() || it == "null" }
                ?.let { Instant.parse(it).toEpochMilli() }
            val now = System.currentTimeMillis()
            for (stay in repository.state.value.stays) {
                if (isStopped || !LocationConsent.enabled(context)) return@withContext Result.success()
                if (stay.id in deletedIds) {
                    // Tombstone until local retention drops the row: no per-run server roundtrip.
                    if (acknowledgements.optLong(stay.id, -1) < stay.sourceRevision) {
                        acknowledgements.put(stay.id, stay.sourceRevision)
                        check(prefs.edit().putString("checkpoint", checkpoint().toString()).commit())
                    }
                    continue
                }
                if (stay.clockDiscontinuity || stay.startedAtMillis < cutoff ||
                    (purgedBefore != null && stay.startedAtMillis <= purgedBefore) ||
                    stay.startedAtMillis <= now - LocationHistoryRepository.RETENTION_MILLIS ||
                    acknowledgements.optLong(stay.id, -1) >= stay.sourceRevision) continue
                try {
                    val encoded = LocationStayWire.encode(stay)
                    val result = client.call("ingest", JSONObject().put("consent_revision", state.getLong("consent_revision"))
                        .put("sync_epoch", epoch).put("stay", encoded))
                    check(result.getString("outcome") in setOf("accepted", "idempotent", "stale"))
                } catch (error: LocationSyncException) {
                    if (error.error == "CONSENT_CONFLICT") {
                        // Web-side re-enable re-bumped the token only: adopt it and retry once.
                        // A revocation surfaces as CONSENT_REQUIRED here and stops sends.
                        client.ensureConsentCurrent()
                        val result = client.call("ingest", JSONObject().put("consent_revision", client.consentRevision)
                            .put("sync_epoch", epoch).put("stay", LocationStayWire.encode(stay)))
                        check(result.getString("outcome") in setOf("accepted", "idempotent", "stale"))
                    }
                    // Terminal exclusion is checkpointed, not an endless retry blocking later stays.
                    else if (error.error !in setOf("DELETED", "EXPIRED", "OUTSIDE_CONSENT_WINDOW", "CLOCK_DISCONTINUITY")) throw error
                }
                acknowledgements.put(stay.id, stay.sourceRevision)
                check(prefs.edit().putString("checkpoint", checkpoint().toString()).commit())
            }
            check(prefs.edit().putLong("last_sync_at", now).commit())
            Result.success()
        } catch (error: CancellationException) { throw error }
        catch (error: AuthSessionException) { Result.failure() }
        catch (error: LocationSyncException) {
            if (error.error == "CONSENT_REQUIRED") {
                check(prefs.edit().putBoolean("enabled", false).remove("pending_places").commit())
                Result.success()
            } else if (error.error in setOf("INVALID_PAYLOAD", "FORBIDDEN")) Result.failure() else Result.retry()
        } catch (_: Exception) { Result.retry() }
        finally { active = null; api.cancelRequests() }
    } }
}
