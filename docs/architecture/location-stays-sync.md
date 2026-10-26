# Location stays contract v1

Implementation baseline for Discussion #66, 2026-10-26. This contract does not imply a deployed feature. Touch events and AI classification are excluded.

## Observation contract

Watch model uses camelCase; wire JSON uses snake_case. UUID `id` and `session_id` are immutable. Each persisted update increases `source_revision`. Fields: `started_at`, `qualified_at`, `last_observed_at`, nullable `end_confirmed_at` (UTC ISO timestamps), `observed_duration_millis` (monotonic duration), `status` (`active`/`closed`), nullable `end_reason`, `clock_discontinuity`, `representative_latitude`, `representative_longitude`, `accuracy_meters`, `observation_radius_meters` (100 initially), `threshold_minutes` (5/10/20/30, default 10).

Local detailed stop reasons map to wire `moved`, `observation_gap`, `stopped`, `interrupted`. Do not credit time after last inside observation. Observation gap is strictly greater than 180 seconds. ACTIVE display additionally requires fresh last observation; sync receipt time never proves presence. Clock discontinuities preserve monotonic duration but exclude automatic chronological recording association; reject such records from cloud v1 with an explicit validation outcome rather than repairing timestamps. All ordinary timestamps must be ordered. Anchor coordinates represent an observed area, not a verified building visit.

First release keeps existing accepted-sample filtering and 100m anchor semantics. Strongly outside observations must persist for 30 seconds across at least two samples before movement closes a stay. Uncertain/outside candidate observations do not extend last inside time. Observation discontinuity ends a segment; never synthesize continuity or an exit from missing evidence. A process-recovered active record closes as interrupted without an invented end confirmation time. Legacy DWELL remains legacy, not a synthesized visit.

## Ownership and synchronization

Owner is existing watch Auth owner; portal access uses current session-bound connection authorization. Location consent is independent of audio. Cloud envelope includes protocol version, consent revision, sync epoch. Server authorizes owner rather than trusting payload. No raw points or full legacy events cross this boundary. Stay-place links are separately versioned derived metadata, never sensor row fields overwritten by watch updates.

Higher source revision wins; equal revision/equal payload is idempotent, equal revision/different payload conflicts, lower revision is stale. Consent disabled denies uploads. Default cutoff is new stays started after opt-in; explicit backfill may permit the retained preceding seven days. Place updates use expected revision CAS, maximum 20 places, 150–2000m radius and existing name constraints. Desired settings apply at next stopped-to-started transition; report desired/applied revisions separately.

Deletion serializes with upload, advances owner epoch and retains deleted IDs without coordinates/labels. Old epoch is rejected; clients fetch and apply deletions before rebuilding an allowed outbox. No blind epoch substitution. Expiry is started_at + seven days, immutable across retries. Expired data is excluded from reads even before cleanup and cannot be recreated by uploads. Saved places do not expire. Revocation stops local pending sends; existing server data deletion is explicit.

## Parallel ownership

- Watch worker: location model/detector/repository/service and their tests; no audio changes.
- Backend worker: new migrations, location protocol fixtures/tests and new location backend modules only; no existing voice-enrich changes. No remote application or deployment.
- Web worker: new `web/src/location-stays/` modules/tests only initially. No production mounting until API and consent are implemented.
- Coordinator: this contract, cross-area integration, shared fixture reconciliation and verification.

The initial parallel batch implements testable foundations. Recommendation thresholds (seven days, two distinct days, three visits) remain provisional. Uncertain data must not become a confident recommendation. Full release requires independent location consent UI, deletion/retention integration, authorization tests and device evidence; foundation tests alone are insufficient.

## Backend RPC foundation

New migration adds `location_stays(p_owner uuid, p_action text, p_payload jsonb default '{}')`. This is a local, undeployed foundation. JWT caller must be the original watch owner or have a live session-bound portal connection; the server does not trust a payload owner. An authorized `snapshot` initializes absent state with consent disabled. Unauthorized actions return `{error:"FORBIDDEN"}`. Successful mutations return `{state: ...}` unless specified below. Errors are JSON outcomes, not HTTP status guarantees.

| Action | Payload | Result / restrictions |
| --- | --- | --- |
| `snapshot` | `{}` | `{protocol_version:1,state,places:[],stays:[],deleted_ids:[]}`. Expired stays excluded. |
| `consent` | `expected_revision`, `enabled` boolean, optional `backfill` boolean | Independent consent CAS. Revision increments, enabling sets cutoff to now or now−7 days. Does not enable audio consent. |
| `put_place` | collection `expected_revision`, UUID `id`, `name`, `latitude`, `longitude`, `radius_meters` | Requires location consent, maximum 20. Collection places revision increments. |
| `delete_place` | collection `expected_revision`, UUID `id` | Removes definition, increments places revision. Does not delete stays or audio. |
| `set_threshold` | collection `expected_revision`, `threshold_minutes` | 5/10/20/30; shares places revision so settings and place set apply atomically at next session. |
| `apply_places` | `revision` | Watch owner only; monotonic ACK not greater than desired revision. |
| `ingest` | `consent_revision`, `sync_epoch`, `stay` with exact v1 fields | Watch owner only. `{outcome:"accepted"|"idempotent"|"stale"}`; equal differing revision conflicts; closed records cannot reopen. |
| `delete_stays` | `expected_epoch`, optional UUID array `ids` (absent/null = all) | Serialized with ingest. Epoch increases; explicit IDs tombstoned even if not uploaded yet. Full purge records `purged_before` to block unknown pending IDs as well. |

State includes `owner_user_id`, `consent_enabled`, `consent_revision`, `sync_epoch`, `upload_cutoff`, nullable `purged_before`, `places_revision`, `applied_places_revision`, `threshold_minutes`, `updated_at`. Place rows include owner/id/name/coordinates/radius/revision. Stay list consists of v1 summary DTOs; expiration is immutable start+7 days. `sync_epoch` is carried in the envelope rather than summary. Clock-discontinuous stays are explicitly rejected.

Error codes: `FORBIDDEN`, `INVALID_PAYLOAD`, `CONSENT_REQUIRED`, `CONSENT_CONFLICT`, `REVISION_CONFLICT`, `EPOCH_CONFLICT`, `PLACE_LIMIT`, `CLOCK_DISCONTINUITY`, `OUTSIDE_CONSENT_WINDOW`, `EXPIRED`, `DELETED`, `UNSUPPORTED_ACTION`. Clients must stop/reconcile on conflict; never blindly substitute the newest epoch into old pending data.

This batch deliberately does not implement stay-place association writes, arbitrary period purge, browser recommendation persistence, or a deployed cleanup schedule. Unsupported actions fail explicitly. `cleanup_location_stays()` is service-role-only; deployment must schedule it separately before release. Query/RLS expiry filtering works even if cleanup is delayed. ID-only deletion tombstones currently remain until owner deletion; compaction requires a future proven protocol.
