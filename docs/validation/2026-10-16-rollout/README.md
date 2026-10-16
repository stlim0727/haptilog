# Portal backend rollout — 2026-10-16

PR #3 was merged and its backend, portal/browser, and Wear OS CI jobs all passed.

## Completed

- Applied the portal schema to the existing HaptiLog project through the connected Supabase app. The migration filename now matches its actual hosted migration history version: `20261016154000_web_portal.sql`.
- Added explicit table privilege revokes before least-privilege grants. Hosted Supabase default table grants can otherwise make a column-specific grant ineffective. Embedded tests now reproduce those defaults.
- Confirmed on the hosted database that authenticated users can update `revoked_at` but cannot update `owner_user_id` or update the entire connection table.
- Deployed `watch-access` and updated `voice-enrich`, with caller authentication handled inside the functions.
- Pairing uses an HKDF-derived key from the existing server-only runtime credential, with an optional explicit override for independent rotation. No new secret is required just to enable pairing.
- A rollback-only hosted PostgreSQL test verified paired reads, human correction writes, prevention of owner reassignment, and immediate loss of recording/correction access after revocation. The transaction rolled back all temporary Auth users, grants, and recording data.
- Security advisors reported only INFO notices for RLS-enabled service-only tables without client policies. Those tables intentionally deny client access; no client policies were added to silence the notices.
- Added configuration-only health probes and a deployment gate, plus a manual GitHub workflow to deploy the independent Cloudflare Worker and custom domain once credentials and backend settings are ready.

## Still open

- Public Auth settings return `external.anonymous_users: false`; a real signup attempt returns `422 anonymous_provider_disabled`. The connected app can deploy schema/functions but does not expose the Auth configuration mutation. CLI/platform credentials are absent and the browser dashboard is signed out.
- The live `voice-enrich?health` probe returns `503 {"ready":false}`: `GEMINI_API_KEY` and/or `GEMINI_MODEL` need configuration in Supabase Edge Function secrets. The probe never calls Gemini and does not disclose secret values.
- No Cloudflare CLI authentication or account/token settings are available. Plugin discovery found no Cloudflare connector; browser access reached a security-verification screen. No Worker or DNS changes have been made.
- Full live signup/pairing/session refresh, original playback, AI analysis/retry, correction retention, and browser revocation remain acceptance tasks after configuration. The attempted API acceptance script stopped at the first disabled-provider response before creating any users.
- Keep the Play release pending until the web address and real pairing flow work. Offline watch capture remains independent of these server settings.

These are external configuration blockers, not completed checklist items. The reproducible check is `npm run check:backend` in `web/`. Domain remains `haptilog.keepory.app` on a separate Worker from the Keepory apex app.
