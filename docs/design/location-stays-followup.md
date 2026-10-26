# Discussion #66 follow-up

Baseline: PR #70, merged 2026-10-26. Touch events and Gemini journal classification remain excluded. This follow-up repairs observed reliability and editing failures; it does not apply a migration or deploy services.

## Reliability fixes and regression expectations

- **W-F1 — Failed stop commit:** always release the in-process detector session. Retain an uncommitted close for retry, with recovery after process death preserving the last durable observation. Once storage recovers, the same repository can start another explicitly requested session. Never claim a failed disk write committed.
- **W-F2 — Pending settings:** apply downloaded places and threshold before a new session starts. A later worker must acknowledge the actually applied settings even if a new session is active. Never acknowledge a downloaded but unapplied revision, a different owner, or different settings with the same revision.
- **W-F3 — Inside-evidence expiry:** uncertain observations cannot extend continuity indefinitely. More than 180 seconds without inside evidence closes the old stay at its last inside observation. Returning later starts a new candidate and cannot bridge the gap for voice association. Preserve the short jitter tolerance and monotonic duration.
- **WEB-F1 — Draft recovery:** transient refresh failures preserve drafts; authorization loss clears sensitive state. After a collection revision conflict, explicitly review/rebase onto current settings while keeping the draft. A retry must use the reviewed revision.
- **WEB-F2 — Hidden suggestions:** browser-local coordinate preferences have bounded retention and are cleaned when relevant stays are deleted or location access is revoked. They must not leak across owners or remain indefinitely after logout.
- **DOC-F1 — Data ownership:** privacy policy, capture design, product specification and architecture must distinguish default local capture, the cloud switch that also carries place/stay uploads, local movement trails, cloud expiry and explicit deletion.

## Remaining product work (separate changes)

| Task | Prerequisite | Acceptance |
| --- | --- | --- |
| Historical place assignment | Versioned derived association API, owner authorization, CAS | Explicitly select among overlapping places; assignments survive place edits and watch stay updates. No mutation of source audio/GPS/time. |
| Period/place-based bulk deletion | Defined overlap rule and deletion transaction | UI previews the selected scope; offline unuploaded stays in the deleted scope cannot reappear. An ID list alone cannot enforce an unknown offline time-range deletion. |
| Tombstone compaction | Proven offline upload horizon and full-purge semantics | No resurrection after compaction; bounded ID-only metadata without prematurely forgetting deleted IDs. |

## Release evidence still required

1. Applied on 2026-10-26 as `20261026082252_location_stays_foundation` plus the cutoff widen-keep migration, with owner and portal-session authorization exercised over the real wire as `authenticated` (see Deployment status in the [contract](../architecture/location-stays-sync.md)). Database advisors were run against a full local mirror. Still to verify against that environment: the authorization path with the watch driving `consent` from the cloud sync switch instead of a location-specific prompt.
2. The `location-stays-cleanup` pg_cron job is scheduled at 04:15 UTC daily; observe its first execution and confirm physical expiry cleanup separately from read exclusion. Read exclusion alone is not physical deletion.
3. Deploy the updated privacy notice and review Play Console data disclosures and location foreground-service description against shipped behavior.
4. Exercise watch → cloud → browser, pending settings between sessions, cloud-switch withdrawal, deletion/reconnect, and audio-only versus audio-plus-location upload combinations on device. Record ambient operation, adjacent-place/jitter behavior and actual battery drain relative to the existing collection baseline.
5. Record browser interaction evidence for keyboard/focus, narrow screens, English/Korean, transient errors, conflicts and authorization loss. Regression tests for editing recovery cover only their tested scenarios, not a full accessibility review.

Do not mark these release tasks complete based on code merge or mock tests. Keep the main voice capture and existing unrelated work intact.
