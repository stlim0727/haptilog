# Release implementation and validation — 2026-10-18

This supplements the initial policy audit; its historical findings are not a claim about the current production version.

Implemented:

- `purgeRecordings` uses fresh server claims, Storage API removal, and `finalize_recording_purges`. The definer RPC explicitly checks current caller/owner authorization, trash/claim state and Storage metadata absence under row locks. Direct authenticated DELETE is blocked. Source identity cannot be changed during a purge. Empty/partial results cannot authorize deleting an existing object.
- Watch cloud opt-in requires an explicit 18+ declaration and disclosure covering existing recordings, audio/location storage, Gemini audio/time processing, and withdrawal limits. Legacy opt-ins require reconsent. Local recording works without consent. Disabling stops workers and persistently queues server consent withdrawal while offline.
- Consent is stored against the authenticated identity using an explicit RPC, not JWT user_metadata or client headers. AI requires both caller and recording owner consent; it rechecks immediately before provider egress. Recording/audio inserts and replacements require consent. Browser AI retry requests explicit adult consent; refusal sends no AI request.
- Privacy policy adds adult/consent and withdrawal disclosures. Settings includes the policy URL. Version name is 1.1.2; a new signed AAB must replace draft 1.1.1 before release.
- Operating process is in `cloud-deletion-runbook.md`; no unimplemented 30-day cleanup or seven-business-day SLA was introduced.

Validated locally: web unit tests (22), browser tests (12), production-browser tests (2), backend tests (32), PGlite migrations/RLS, Android debug build, Lint and unit tests. Deno typecheck passed. Native Wear OS emulator displayed the disclosure and both choices; declining kept cloud off. A real offline recording persisted with the same file size after process death/restart. This does not replace physical-watch haptic/battery acceptance.

Production Supabase:

- Applied missing wastebin/security/purge migrations, then cloud consent. Local migration versions are synchronized with the deployment ledger.
- `voice-enrich` v13 deployed, with prior v12 source equality verified; verify final v13 source against the release commit before final signoff.
- A separate synthetic anonymous account verified: pre-consent insert denied; direct DELETE denied; claimed record with existing audio cannot finalize; withdrawn consent blocks AI with 403; Storage API remove then finalization succeeds; repeated finalization is harmless. No paid inference was invoked. Test audio/row and the synthetic Auth identity were removed.
- Security advisors: private/no-policy tables intentionally deny direct access; anonymous access is part of the scoped pairing design. Authenticated definer RPCs are deliberate APIs with explicit authorization; anon execution is revoked. Trigger mutable search_path was corrected in the consent migration. No unrelated password-auth setting was changed.

Play Console target age was saved as 18+ only, confirmed by the saved summary. Content rating remains separate and was not arbitrarily raised.

The owner confirmed paid Billing is connected to the Gemini API project. This is owner-provided evidence, not independent project-ID linkage verification. Adult eligibility is self-declared, not identity/age verification; the implementation does not guarantee that minors cannot lie. A project-specific legal assurance has not been claimed.

Before submission: verify live portal/privacy deployment, final v13 source, new signed 1.1.2 AAB, support inbox readiness, Data safety adult-declaration coverage, supported distribution countries and all Console quick checks. Keep review submission held until these are resolved.
