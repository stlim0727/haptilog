# Raw location capture and cloud stays v2

Plan: [#98](https://github.com/stlim0727/haptilog/issues/98), 2026-10-27.
Baseline: `2869351` (#97). This is the implementation contract for subsequent
increments, not an implemented or deployed API. Step 1 only removes watch
history/editing UI; the [v1 summary protocol](location-stays-sync.md) remains in
use until steps 2 and 3 pass their activation gates.

## Product boundary

The watch owns collection consent, durable capture and upload. The server owns
stay inference. The portal owns rich browsing, place management and cadence
settings. Neither server configuration nor cloud consent can turn local collection
on, elevate its scope, start a microphone, or change voice recording's GPS
snapshot/start-stop/haptic/wake-lock behavior.

Watch Settings keeps Location recording (Off / Only when recording / Always) and
the common Cloud sync choice. There is no coordinate browser, place editor or
second location/cloud setup screen. The ongoing location notification still
reports collection and offers Stop; its body opens Location recording. Old
internal journal and location-sync activity intents redirect to Location recording
and Settings respectively so pending intents survive app upgrades.

Cloud sync off still permits local capture. It does not imply a browsable local
history on the watch. Existing v1 saved places and history are preserved by the UI
increment. Local capture, cloud processing and server data deletion stay distinct.

## Increment sequence

1. Retire the watch history/editor UI, retain compatibility redirects and current
   notification stop behavior, and document this contract. Keep v1 inference,
   summary upload, consent and retention unchanged.
2. Add raw outbox, versioned raw consent and owner-only batch ingest; add server
   processing and preserve existing portal stay DTO compatibility. Activate v2
   only after ingestion, processing, deletion and compatibility tests pass.
3. Expose cadence settings in the portal, implement desired/applied revisions on
   the watch, and complete Wear OS offline/background/device validation.

No production database, function, website or Play Store changes are part of the
first increment. A later release must deploy the compatible backend before the
portal controls and new watch build. A capability response gates activation;
absence of v2 support leaves the current v1 path in force.

## Durable raw envelope

Raw means validated sensor observations before movement thinning or stay
classification, not the current repository's five-minute stationary point list.
That filtered list cannot reconstruct a continuous ten-minute stay. The new
outbox must receive every valid observation before the local v1 movement filter.

Proposed version 2 batch fields:

| Field | Meaning |
| --- | --- |
| `protocol_version` | Exactly 2; unknown versions fail explicitly |
| `batch_id` | Persisted UUID, unchanged on retry |
| `capture_session_id` | UUID renewed on capture start, reboot or process recovery |
| `consent_revision`, `sync_epoch` | Server-issued authorization/deletion generation |
| `settings_revision` | The applied capture settings for this session |
| `samples` | Up to 500 observations; bounded body size (256 KiB maximum) |
| `session_end` | Optional durable terminal marker with last sequence and reason |

Each sample carries a stable UUID, strictly increasing session sequence,
`observed_at` (UTC), `elapsed_realtime_millis`, coordinates, horizontal accuracy,
capture-time monotonic age, and optional altitude/speed with their availability
flags. Absent sensor fields remain absent; zero does not mean unknown. Server
ownership comes from the authenticated watch identity, never a payload owner.

Persist the session, sample IDs, sequence and settings revision atomically before
upload. The upload ACK checkpoints exact accepted IDs only after the server raw
transaction commits; a lost ACK retries the identical payload. Same identity and
same content is idempotent; same identity with different content is a conflict.
No source coordinate, timestamp or accuracy is rewritten during processing.

Bounded ingest validates finite numbers, coordinate/accuracy ranges, sample count,
UTC/monotonic consistency and recorded-at consent/retention windows. Samples with
unusable UTC are retained locally and reported as excluded, not silently repaired
or uploaded as a fabricated route. Old capture-time samples delivered late remain
eligible: delayed network arrival is not a stale GPS fix. A separate capture-time
age field distinguishes cached sensor fixes from delayed uploads.

## Authorization, consent and lifecycle

The current `2026-10-26-unified` policy only permits stay summaries. A new policy
must explicitly cover precise location samples, route reconstruction, raw retention
and server stay processing. An existing opt-in never implicitly authorizes raw.
Without the new consent, v2 ingest refuses the request and current v1 consent
continues to work. The common switch remains the user-facing control; the expanded
scope needs explicit re-consent rather than another permanent toggle.

Raw upload is watch-owner only; a connected browser may read derived history and
edit settings but cannot forge sensor samples. Raw storage uses RLS and no direct
portal table access. Processing is a privileged bounded job, not a client-trusted
stay declaration. Raw data is not sent to Gemini or another external AI provider.

Turning cloud sync off stops raw sends immediately and queues remote withdrawal.
Inflight requests can finish; queued requests must recheck local consent before
each send and the server must check current consent inside the ingest transaction.
Do not silently attach a new consent generation to old pending samples. First raw
consent starts a fresh upload window; pre-consent raw is excluded in this version.
Re-enabling or account recovery cannot bypass that window or deletion barriers.

Raw server retention is seven days from observation, never receipt. Derived stay
retention remains seven days from stay start. Reads and reprocessing exclude
expired rows before asynchronous physical cleanup. V1 tombstones/epochs remain in
force. Deleting a derived stay must also suppress all its contributing raw ranges
so recomputation cannot resurrect it. A full purge additionally records a source
time/session barrier for unknown offline samples; an ID list alone is insufficient.
Deletion and ingest serialize per owner. Period/place deletion and tombstone
compaction remain separate work in #88/#89 unless explicitly implemented here.

Local acknowledged raw follows bounded retention. Unacknowledged samples remain
durable through network failure and process death; never evict them silently to
make space. Before a configured disk safety limit is reached, stop new location
capture with an actionable error, preserving existing sources and voice recording.
Expired/consent-excluded upload outcomes are explicit terminal checkpoints and
must not trigger endless retries or be mistaken for successful server storage.

## Server inference

Ingest commits raw observations plus a processing request in one transaction.
ACK means durable receipt, not completed stay inference. Processing failure leaves
raw intact, exposes a retryable processing state and does not require resending
audio or raw. Jobs serialize per capture session and checkpoint detector version
and last processed source sequence.

Sort by session sequence and monotonic observation time, never upload receipt time.
Duplicates, reversed batches and missing ranges must be tested. A sequence hole
blocks finalization until filled, explicitly declared lost, or expired; it must
never count as observed presence. Session-end markers may arrive before samples.
Reboots/process restarts close continuity instead of joining unrelated monotonic
clocks. Bounded retries/reprocessing must produce stable source-linked stay IDs
and newer derived revisions, preserving deletion exclusions and manual metadata.

Initial detector parity uses the existing 100 m anchor, 100 m maximum accuracy,
two confidently outside samples at least 30 seconds apart, and strictly greater
than 180 seconds without inside evidence to end continuity. Default qualification
is ten minutes; supported thresholds remain 5/10/20/30 minutes. Uncertainty or
missing observations never extend confirmed duration. A late upload does not make
an old stay active now. Clock-discontinuous observations are excluded from
automatic wall-time association and are not repaired using receipt time.

Raw remains immutable when detector logic changes. Recomputing retained raw must
reconcile source-linked IDs, revision ordering, place associations and deleted
ranges before replacing visible derived output. Threshold changes apply to the
next capture session initially; historical recomputation is an explicit operation,
not a side effect of editing a setting.

V1 historical summaries stay readable. Each new capture session freezes one
pipeline version. A v2 session must not also upload v1 locally derived summaries;
rollback ends that session and starts a new v1 session without duplicating it.

## Remote cadence settings

| Setting | Allowed values | Default |
| --- | --- | --- |
| GPS target interval | 30 / 60 / 120 seconds | 60 seconds |
| Batch upload target interval | 15 / 30 / 60 minutes | 15 minutes |

Longer GPS intervals would conflict with the initial 180-second continuity rule;
they are deliberately unsupported. A 120-second setting can still produce gaps
when Android delays a fix; inference must break rather than infer presence.

The portal saves with `expected_revision`; conflicts preserve drafts and require
review. Server and watch both validate the allowlists. Downloaded settings are
cached under the current owner; unknown/invalid settings do not replace a working
cache. With no cache use defaults. On the next successful sync, apply upload
cadence to future work and stage capture cadence for the next session boundary.
The UI distinguishes desired from applied settings; it must not claim that an
offline watch has updated. A future active-session handover can be added only with
an explicit serialized close/start that preserves samples and metadata.

An offline watch cannot receive configuration changes. Android background/Doze
constraints make cadence a target, not an exact timer. WorkManager periodic upload
has a 15-minute floor; stop/reconnect may enqueue a separate constrained flush.
Never hold a wake lock or force GPS merely to meet an upload deadline. Reducing
scope or notification Stop always wins over pending remote settings.

## Required evidence before activation

- Durable outbox after process death, network failure and lost ACK; batch limits,
  duplicates, content conflicts, reversed order, gaps and late terminal markers.
- Wrong-owner/browser writes denied, new raw consent enforced, withdrawal races,
  consent/account restoration, expiry and deletion/recompute/re-upload safety.
- Ten-minute qualification boundary, accuracy uncertainty, movement, gaps, clock
  changes, reboot, multi-day sessions, detector replay and v1/v2 coexistence.
- Defaults, offline cache, invalid revisions/ranges, desired/applied UI and settings
  conflicts; no remote scope escalation or active-session setting mutation.
- Full relevant watch/backend/portal checks and Wear OS evidence for notification
  navigation/Stop, offline capture, background delivery and audio/haptic isolation.
- Real-watch battery and upload-volume measurements before choosing release defaults;
  emulator tests do not establish physical battery/GNSS performance.
