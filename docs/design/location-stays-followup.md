# Discussion #66 follow-up

Baseline: PR #70, merged 2026-10-26. Touch events and Gemini journal classification remain excluded. This follow-up repairs observed reliability and editing failures; it does not apply a migration or deploy services.

## Reliability fixes and regression expectations

- **W-F1 — Failed stop commit:** always release the in-process detector session. Retain an uncommitted close for retry, with recovery after process death preserving the last durable observation. Once storage recovers, the same repository can start another explicitly requested session. Never claim a failed disk write committed.
- **W-F2 — Pending settings:** apply downloaded places and threshold before a new session starts. A later worker must acknowledge the actually applied settings even if a new session is active. Never acknowledge a downloaded but unapplied revision, a different owner, or different settings with the same revision.
- **W-F3 — Inside-evidence expiry:** uncertain observations cannot extend continuity indefinitely. More than 180 seconds without inside evidence closes the old stay at its last inside observation. Returning later starts a new candidate and cannot bridge the gap for voice association. Preserve the short jitter tolerance and monotonic duration.
- **WEB-F1 — Draft recovery:** transient refresh failures preserve drafts; authorization loss clears sensitive state. After a collection revision conflict, explicitly review/rebase onto current settings while keeping the draft. A retry must use the reviewed revision.
- **WEB-F2 — Hidden suggestions:** browser-local coordinate preferences have bounded retention and are cleaned when relevant stays are deleted or location access is revoked. They must not leak across owners or remain indefinitely after logout.
- **DOC-F1 — Data ownership:** privacy policy, capture design, product specification and architecture must distinguish default local capture, independent optional place/stay uploads, local movement trails, cloud expiry and explicit deletion.

## Remaining product work (separate changes)

| Task | Prerequisite | Acceptance |
| --- | --- | --- |
| Historical place assignment | Versioned derived association API, owner authorization, CAS | Explicitly select among overlapping places; assignments survive place edits and watch stay updates. No mutation of source audio/GPS/time. |
| Period/place-based bulk deletion | Defined overlap rule and deletion transaction | UI previews the selected scope; offline unuploaded stays in the deleted scope cannot reappear. An ID list alone cannot enforce an unknown offline time-range deletion. |
| Tombstone compaction | Proven offline upload horizon and full-purge semantics | No resurrection after compaction; bounded ID-only metadata without prematurely forgetting deleted IDs. |

## Release evidence still required

1. ~~Apply the migration to the intended Supabase environment and verify actual owner/portal session authorization and independent consent against that environment. Run database advisors.~~ Done on 2026-10-26: `20261026082252_location_stays_foundation` is applied to the production project and contract behaviour was checked over the real wire as `authenticated` with a live session JWT (see [Deployment status](../architecture/location-stays-sync.md#deployment-status)). Local PGlite tests are not deployment evidence.
2. Configure and observe scheduled `cleanup_location_stays()`; verify physical expiry cleanup and immediate read exclusion separately. Read exclusion alone is not physical deletion.
3. Deploy the updated privacy notice and review Play Console data disclosures and location foreground-service description against shipped behavior.
4. Exercise watch → cloud → browser, pending settings between sessions, offline consent withdrawal, deletion/reconnect, and independent audio/location consent combinations on device. Record ambient operation, adjacent-place/jitter behavior and actual battery drain relative to the existing collection baseline.
5. Record browser interaction evidence for keyboard/focus, narrow screens, English/Korean, transient errors, conflicts and authorization loss. **Still open for the shipped journal.** The live pass recorded on 2026-10-26 ([the portal pass](../validation/2026-10-26-portal-pass/README.md)) used a real watch-code pairing against production data and measured keyboard/focus order, 390 and 320 CSS-pixel geometry, light/dark contrast, a read-only RPC audit and watch-side revocation reaching the portal as `FORBIDDEN` — but against the standalone location workspace that PR #84 replaced the same day. Those measurements do not describe the unified journal cards, `StayInspector` or the **장소 설정 / Place settings** dialog, so the item is not closed; repeat the probes on the current portal. Transient failures, conflicts and authorization loss are asserted in `web/e2e/stays-followup.spec.ts`, and English/Korean in `web/e2e/stays-locale.spec.ts`, both with mocked RPCs. Also still missing: an assistive-technology pass and live recording-to-stay association evidence.

Do not mark these release tasks complete based on code merge or mock tests. Keep the main voice capture and existing unrelated work intact.
