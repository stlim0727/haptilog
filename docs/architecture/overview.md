# HaptiLog Architecture Overview

## 1. Principles

1. **Local Durability First**: Audio records directly to local app storage (`context.filesDir/recordings/`). Recording will not terminate prematurely due to network anomalies.
2. **Haptic Clarity without Acoustic Noise**: The heartbeat vibration pattern is tuned to be felt on the wrist (mechanoreceptors) while minimizing chassis vibrations that could bleed into the MEMS microphone.
3. **Power Efficiency**: Uses `MediaRecorder` with AAC compression (low CPU) instead of raw `AudioRecord` (high CPU). Voice-memo location acquisition is limited to active recording. The separately enabled location journal uses a bounded, user-started location foreground service; it does not hold the audio service's wake lock.
4. **Multimodal AI Enrichment**: Raw audio is passed directly to Gemini along with latitude/longitude and timestamp. Gemini's native audio understanding handles accents, background noise, and intent recognition without a separate fragile STT step.

## 2. Audio & Haptic Flow

```
[User Tap]
   │
   ├──> Haptic: Crisp Click (PRIMITIVE_CLICK)
   ├──> Location: Cache snapshot (lastLocation) & Request getCurrentLocation()
   ├──> Service: Start Foreground Service (Notification + WakeLock)
   ├──> Audio: Initialize MediaRecorder (Output: MPEG_4, 16kHz, 32kbps)
   └──> Haptic Loop: Every 2.4s -> 쿵(40ms) - 쉼(80ms) - 쾅(50ms)
```

## 3. Data Contract

Each recording session produces:
1. `rec_<uuid>.m4a`: Audio stream.
2. `meta_<uuid>.json`:
```json
{
  "id": "uuid-v4",
  "started_at": "2026-10-13T12:00:00Z",
  "duration_seconds": 18,
  "status": "COMPLETED",
  "latitude": 37.541,
  "longitude": 127.056,
  "altitude": 24.5,
  "speed": 1.2,
  "accuracy": 8.0,
  "location_timestamp": "2026-10-13T12:00:01Z",
  "sync_status": "PENDING_SYNC"
}
```

The audio filename is `rec_<uuid>.m4a`. Location fields are optional. A cached fix older than two minutes is ignored; a high-accuracy refinement is attempted with a 15-second bound and cancelled at stop. Metadata is written atomically and session updates are serialized on the main dispatcher. Failed capture uses `status: FAILED` and `sync_status: CAPTURE_FAILED`; its audio is retained for inspection.

The backend uses the caller's JWT and recording ownership to authorize enrichment before calling Gemini. Derived enrichments are inserted using a privileged server-only client. Opt-in WorkManager jobs use connectivity/battery constraints, exponential backoff and a periodic safety scan. Raw audio and metadata remain on the watch; `sync_<uuid>.json` stores retry checkpoints and `enrich_<uuid>.json` stores derived output. Startup marks unfinished captures interrupted and synthesizes discoverable metadata for orphan audio, without asserting that partial MP4 files are playable. Backend retries reuse versioned enrichment output and a service-only three-minute lease prevents concurrent provider calls. ZIP export includes source audio/metadata and enrichment, excluding session credentials.

## 4. Optional Location Journal

The location journal is a separate capture path from voice recording. Users start it from the watch, see an ongoing location notification, and can stop it from location settings or the notification. It samples location while the screen is off, filters unreliable or redundant fixes, and derives named-place entry/exit and dwell events. GPS circles are virtual place markers, not Bluetooth beacons.

Journal data is local by default. Legacy audio-only consent never uploads it. The explicit combined cloud policy covers recordings, attached location, saved places and stay summaries; an independent location worker sends the latter to Supabase; filtered movement points and legacy events remain local, and journal data is not sent to Gemini. Settings downloaded during tracking apply before the next explicit session, with a separate server acknowledgement. Cloud summaries expire seven days after their observed start; saved places persist until deleted. A scheduled daily job removes expired summaries from storage, so physical removal can trail the expiry moment by up to a day while reads already exclude them. Stopping or deleting journal data must not modify audio files. See [Location Journal](../design/location-journal.md) and the [stay synchronization contract](location-stays-sync.md) for capture, consent, deletion, and release boundaries.


The additional precise-originals scope upgrade is separate from existing combined
consent. After approval, new pre-filter observations can sync to a private Supabase
raw store and the portal DEV map; pre-approval observations never backfill. Raw
sources have seven-day server retention and are not sent to Gemini. This developer
lane leaves v1 stay inference intact. See [raw location developer map](../development/raw-location-map.md).

## 5. Unified journal presentation target (2026-10-26)

The approved UX revision presents voice and stay records through a discriminated journal-item model, preserving their separate capture, consent, synchronization and deletion contracts. Do not create fake recording rows or audio metadata for stays. Journal queries and UI state are scoped to the current authorized owner and portal session; stale asynchronous results must not carry place or stay data into another session. Location RPC failure must not prevent voice browsing.

A shared chronological list/detail region supports both types. Dates for stays use their observed interval and keep the original stay ID across midnight. Duration comes from `observed_duration_millis`; server refresh time and wall-clock elapsed time are not evidence of presence. Current place definitions may supply an explicitly labelled candidate, never overwrite observed source data or assert a historical assignment.

The watch exposes location scope and common cloud sync in Settings; the separate stay browser and place editor are retired. Enabling or disabling sync while collection runs must not stop or restart its foreground service. Pending cloud settings are applied at the next explicit collection session, as in the existing protocol. Consent, revocation, retained-history cutoff, owner authorization and deletion epochs remain unchanged. The UI revision requires implementation and validation; it is not a claim of deployment. See [the two-round review](../design/2026-10-26-unified-journal-review.md).


Location settings now distinguish collection scope (off / recording only / always) from combined cloud sync. The latter uses one explicit policy for audio, attached locations, places and retained stay summaries. Location collection has no time limit. The platform never restarts it after process death or reboot; while the scope is always, opening a watch screen resumes it. See [the synchronization contract](location-stays-sync.md#combined-cloud-choice-discussion-93-implementation) for rollout and legacy compatibility.


## 6. Raw-location processing transition (2026-10-27)

[Issue #98](https://github.com/stlim0727/haptilog/issues/98) plans a durable watch outbox, explicit raw-location consent, server stay derivation and web-managed collection/upload cadence. The [v2 contract](location-capture-v2.md) defines the proposed boundaries and release sequence. The first increment simplifies watch navigation only: notification taps open Location recording, and old internal journal/sync intents redirect to their corresponding settings. Capture, the v1 local detector, summary sync and current consent remain unchanged. No raw-location endpoint or remote cadence is active yet.
