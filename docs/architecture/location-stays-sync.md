# Location stays contract v1

Implementation baseline for Discussion #66, 2026-10-26. The backend described here is applied to production; on-device and portal end-to-end validation remain open. Touch events and AI classification are excluded.

## Observation contract

Watch model uses camelCase; wire JSON uses snake_case. UUID `id` and `session_id` are immutable. Each persisted update increases `source_revision`. Fields: `started_at`, `qualified_at`, `last_observed_at`, nullable `end_confirmed_at` (UTC ISO timestamps), `observed_duration_millis` (monotonic duration), `status` (`active`/`closed`), nullable `end_reason`, `clock_discontinuity`, `representative_latitude`, `representative_longitude`, `accuracy_meters`, `observation_radius_meters` (100 initially), `threshold_minutes` (5/10/20/30, default 10).

Local detailed stop reasons map to wire `moved`, `observation_gap`, `stopped`, `interrupted`. Do not credit time after last inside observation. Observation gap is strictly greater than 180 seconds. ACTIVE display additionally requires fresh last observation; sync receipt time never proves presence. Clock discontinuities preserve monotonic duration but exclude automatic chronological recording association; reject such records from cloud v1 with an explicit validation outcome rather than repairing timestamps. All ordinary timestamps must be ordered. Anchor coordinates represent an observed area, not a verified building visit.

First release keeps existing accepted-sample filtering and 100m anchor semantics. Strongly outside observations must persist for 30 seconds across at least two samples before movement closes a stay. Uncertain/outside candidate observations do not extend last inside time. More than 180 seconds without inside evidence ends the segment even when uncertain fixes continue to arrive; later inside evidence must qualify a new stay. Never synthesize continuity or an exit from missing evidence. A process-recovered active record closes as interrupted without an invented end confirmation time. Legacy DWELL remains legacy, not a synthesized visit.

## Ownership and synchronization

Owner is existing watch Auth owner; portal access uses current session-bound connection authorization. Legacy location consent is independent of audio; new combined-policy accounts use the common cloud choice described below. Cloud envelope includes protocol version, consent revision, sync epoch. Server authorizes owner rather than trusting payload. No raw points or full legacy events cross this boundary. Stay-place links are separately versioned derived metadata, never sensor row fields overwritten by watch updates.

Higher source revision wins; equal revision/equal payload is idempotent, equal revision/different payload conflicts, lower revision is stale. Consent disabled denies uploads. Default cutoff is new stays started after opt-in; explicit backfill may permit the retained preceding seven days. Enabling widens but never narrows an already-granted cutoff, so a later opt-in without backfill keeps an earlier seven-day window; narrowing requires explicit deletion (issue #79). Place updates use expected revision CAS, maximum 20 places, 150–2000m radius and existing name constraints. Downloaded settings apply before the next stopped-to-started transition; report desired/applied revisions separately. Persist an owner-scoped proof of the exact applied revision and settings. The next worker may acknowledge that proof during an active session, but must not acknowledge a newer download, different owner/content or reset local settings. Transient web failures preserve editing drafts; CAS conflicts require explicit review before rebasing.

Deletion serializes with upload, advances owner epoch and retains deleted IDs without coordinates/labels. Old epoch is rejected; clients fetch and apply deletions before rebuilding an allowed outbox. No blind epoch substitution. Expiry is started_at + seven days, immutable across retries. Expired data is excluded from reads even before cleanup and cannot be recreated by uploads. Saved places do not expire. Revocation stops local pending sends; existing server data deletion is explicit.

## Parallel ownership

- Watch worker: location model/detector/repository/service and their tests; no audio changes.
- Backend worker: new migrations, location protocol fixtures/tests and new location backend modules only; no existing voice-enrich changes. That batch did not apply or deploy anything; production application is recorded under Deployment status.
- Web worker: new `web/src/location-stays/` modules/tests only initially. No production mounting until API and consent are implemented.
- Coordinator: this contract, cross-area integration, shared fixture reconciliation and verification.

The initial parallel batch implements testable foundations. Recommendation thresholds (seven days, two distinct days, three visits) remain provisional. Uncertain data must not become a confident recommendation. Full release requires explicit versioned cloud consent UI, deletion/retention integration, authorization tests and device evidence; foundation tests alone are insufficient.

## Backend RPC foundation

New migration adds `location_stays(p_owner uuid, p_action text, p_payload jsonb default '{}')`. The migration is applied and the RPC is callable by an authenticated watch session. JWT caller must be the original watch owner or have a live session-bound portal connection; the server does not trust a payload owner. An authorized `snapshot` initializes absent state with consent disabled. Unauthorized actions return `{error:"FORBIDDEN"}`. Successful mutations return `{state: ...}` unless specified below. Errors are JSON outcomes, not HTTP status guarantees.

| Action | Payload | Result / restrictions |
| --- | --- | --- |
| `snapshot` | `{}` | `{protocol_version:1,state,places:[],stays:[],deleted_ids:[]}`. Expired stays excluded. |
| `consent` | `expected_revision`, `enabled` boolean, optional `backfill` boolean | Independent consent CAS. Revision increments, enabling sets cutoff to now or now−7 days, but never later than an existing cutoff. Does not enable audio consent. |
| `put_place` | collection `expected_revision`, UUID `id`, `name`, `latitude`, `longitude`, `radius_meters` | Requires location consent, maximum 20. Collection places revision increments. |
| `delete_place` | collection `expected_revision`, UUID `id` | Removes definition, increments places revision. Does not delete stays or audio. |
| `set_threshold` | collection `expected_revision`, `threshold_minutes` | 5/10/20/30; shares places revision so settings and place set apply atomically at next session. |
| `apply_places` | `revision` | Watch owner only; monotonic ACK not greater than desired revision. |
| `ingest` | `consent_revision`, `sync_epoch`, `stay` with exact v1 fields | Watch owner only. `{outcome:"accepted"|"idempotent"|"stale"}`; equal differing revision conflicts; closed records cannot reopen. |
| `delete_stays` | `expected_epoch`, optional UUID array `ids` (absent/null = all) | Serialized with ingest. Epoch increases; explicit IDs tombstoned even if not uploaded yet. Full purge records `purged_before` to block unknown pending IDs as well. |

State includes `owner_user_id`, `consent_enabled`, `consent_revision`, `sync_epoch`, `upload_cutoff`, nullable `purged_before`, `places_revision`, `applied_places_revision`, `threshold_minutes`, `updated_at`. Place rows include owner/id/name/coordinates/radius/revision. Stay list consists of v1 summary DTOs; expiration is immutable start+7 days. `sync_epoch` is carried in the envelope rather than summary. Clock-discontinuous stays are explicitly rejected.

Error codes: `FORBIDDEN`, `INVALID_PAYLOAD`, `CONSENT_REQUIRED`, `CONSENT_CONFLICT`, `REVISION_CONFLICT`, `EPOCH_CONFLICT`, `PLACE_LIMIT`, `CLOCK_DISCONTINUITY`, `OUTSIDE_CONSENT_WINDOW`, `EXPIRED`, `DELETED`, `UNSUPPORTED_ACTION`. Clients must stop/reconcile on conflict; never blindly substitute the newest epoch into old pending data.

This contract does not implement stay-place association writes, arbitrary period purge, or browser recommendation persistence. Unsupported actions fail explicitly. `cleanup_location_stays()` is not callable through the API or by `authenticated`; it runs as the scheduled job described below. Query and RLS expiry filtering hides expired stays regardless of cleanup timing, so a delayed run is a storage concern rather than a disclosure one. ID-only deletion tombstones currently remain until owner deletion; compaction requires a future proven protocol.

Browser-local hidden-suggestion coordinates are distinct from server persistence: they expire within seven days or at their source stays' earliest expiry, are pruned on access, and are cleared after stay deletion, observed access/consent revocation and sign-out. See the [follow-up checklist](../design/location-stays-followup.md) for regression expectations and remaining release evidence.

## Deployment status

Applied to the production project on 2026-10-26 as `20261026082252_location_stays_foundation`. The migration is purely additive: four tables, one expiry index, four RLS-enabled tables with SELECT-only `authenticated` policies, the security-definer dispatch function, and the two public functions.

Expiry cleanup is scheduled inside the database rather than left to a release step: the `pg_cron` job `location-stays-cleanup` runs `select public.cleanup_location_stays()` on `15 4 * * *` as the role that scheduled it. Its first execution is 2026-10-27 04:15 UTC.

Contract behaviour was checked against production over the real wire as `authenticated` with a live session JWT, not through a superuser SQL session: `snapshot`, `consent`, `ingest`, `apply_places` and the filtered read path; a `delete_stays` followed by an offline re-`ingest` of the same stay returns `DELETED`; a stale `sync_epoch` returns `EPOCH_CONFLICT`; a stay starting before `upload_cutoff` returns `OUTSIDE_CONSENT_WINDOW`.

A shipping watch client has since driven the same path on its own: enabling consent, uploading a saved place, and ingesting closed stays whose `qualified_at` is start plus the ten-minute threshold, whose `expires_at` is exactly start plus seven days, and whose `source_revision` climbs as the active stay is re-persisted. A Wear OS 4 emulator run with a fresh anonymous account reproduced the whole sequence: consent with backfill off (so `upload_cutoff` is the opt-in instant), the place upload, a stay qualifying ten minutes after the first accepted sample, periodic runs advancing its revision while active, and stopping the journal closing it as `stopped` and triggering an immediate sync.

The portal browser and accessibility pass was run once against production: see [the 2026-10-26 portal pass record](../validation/2026-10-26-portal-pass/README.md) for the live pairing, keyboard/focus, narrow-screen, contrast, read-only-browsing and revocation results, and what the pass deliberately does not certify. It measured the standalone stays workspace that PR #84 has since replaced, so the unified journal still needs its own live pass — tracked in issue #86, not closed here. Database advisors were run against a local mirror of the full schema and reported three pre-existing `auth_rls_initplan` warnings, none from this migration.

## Combined cloud choice (Discussion #93 implementation)

New watch builds use `set_unified_cloud_consent` with policy `2026-10-26-unified`.
The RPC updates recording and location consent and initial local place import in
one transaction. It includes completed recordings and retained seven-day stays;
raw points remain local. Scope selection is watch-local and does not change sync.
`location_sync_state.consent_scope=all_records` tells the portal that withdrawal
covers recordings and location together. Existing accounts stay on their prior
scope until explicit acceptance. After migration, legacy enabling endpoints
cannot downgrade or regrant consent; legacy withdrawal revokes both flags.
Deletion epochs, tombstones, revisions and ownership checks remain in force.
The stay validator accepts durations over eight hours but bounds them by the
observed timestamp interval. Collection has no session duration limit.

These are source changes, not a claim that the migration or app is deployed.
Deploy the migration and compatible voice-enrich handler before enabling this
watch build in production; otherwise the combined RPC/AI processing is unavailable.
