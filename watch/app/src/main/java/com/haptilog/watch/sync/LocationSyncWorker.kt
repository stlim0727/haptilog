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
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Independent scheduling: location sync must also run when there are no recordings. */
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
            // Old unscoped pending data cannot prove which watch owner it belongs to.
            if (!pending.has("owner_user_id")) return null
            val places = pending.getJSONArray("places")
            val parsed = (0 until places.length()).map { index ->
                val place = places.getJSONObject(index)
                SavedPlace(place.getString("id"), place.getString("name"), place.getDouble("latitude"),
                    place.getDouble("longitude"), place.getDouble("radius_meters"))
            }
            if (!repository.applySyncedPlaces(parsed, pending.getInt("threshold_minutes"))) return null
            check(LocationConsent.preferences(context).edit()
                .putLong("applied_places_revision", pending.getLong("revision"))
                .putString("applied_places_signature", settingsSignature(pending)).commit())
            return pending.getLong("revision")
        }

        /** Stable proof of what was applied, scoped to the owner, not a consent or stay epoch. */
        private fun settingsSignature(pending: JSONObject): String {
            val places = pending.getJSONArray("places")
            val normalized = (0 until places.length()).map { places.getJSONObject(it) }
                .sortedBy { it.getString("id") }.map { place ->
                    JSONObject().put("id", place.getString("id")).put("name", place.getString("name"))
                        .put("latitude", place.getDouble("latitude")).put("longitude", place.getDouble("longitude"))
                        .put("radius_meters", place.getDouble("radius_meters"))
                }
            return JSONObject().put("owner_user_id", pending.getString("owner_user_id"))
                .put("revision", pending.getLong("revision"))
                .put("threshold_minutes", pending.getInt("threshold_minutes"))
                .put("places", JSONArray(normalized)).toString()
        }

        /** Can ACK a prior pre-start application even while this session defers new settings. */
        internal fun syncPlaces(context: Context, repository: LocationHistoryRepository,
                                client: LocationSyncClient, snapshot: JSONObject) {
            if (!LocationConsent.enabled(context)) return
            val prefs = LocationConsent.preferences(context)
            val state = snapshot.getJSONObject("state")
            val desired = state.getLong("places_revision")
            val pending = JSONObject().put("owner_user_id", state.getString("owner_user_id"))
                .put("revision", desired).put("threshold_minutes", state.getInt("threshold_minutes"))
                .put("places", snapshot.getJSONArray("places"))
            check(prefs.edit().putString("pending_places", pending.toString()).commit())
            applyPending(context, repository)
            val local = repository.state.value
            val current = JSONObject(pending.toString()).put("threshold_minutes", local.dwellMinutes)
                .put("places", JSONArray(local.places.map { place ->
                    JSONObject().put("id", place.id).put("name", place.name)
                        .put("latitude", place.latitude).put("longitude", place.longitude)
                        .put("radius_meters", place.radiusMeters)
                }))
            // A bare historical revision could belong to another owner or reset settings.
            // Only the exact persisted application proof can acknowledge this snapshot.
            if (prefs.getLong("applied_places_revision", -1) == desired &&
                prefs.getString("applied_places_signature", null) == settingsSignature(pending) &&
                settingsSignature(current) == settingsSignature(pending) &&
                desired > state.getLong("applied_places_revision") && LocationConsent.enabled(context)) {
                client.call("apply_places", JSONObject().put("revision", desired))
            }
        }
    }

    override suspend fun doWork(): Result = mutex.withLock { withContext(Dispatchers.IO) {
        val context = applicationContext
        val consentGeneration = CloudConsent.generation(context)
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
                CloudConsent.observeWithdrawal(context, consentGeneration)
                check(prefs.edit().remove("checkpoint").remove("pending_places").commit())
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
            syncPlaces(context, repository, client, snapshot)
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
                CloudConsent.observeWithdrawal(context, consentGeneration)
                check(prefs.edit().remove("pending_places").commit())
                Result.success()
            } else if (error.error in setOf("INVALID_PAYLOAD", "FORBIDDEN")) Result.failure() else Result.retry()
        } catch (_: Exception) { Result.retry() }
        finally { active = null; api.cancelRequests() }
    } }
}
