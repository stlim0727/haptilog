# Google account recovery validation

Implementation on `feat/google-account-recovery`, stacked on the mobile portal
PR #49. Existing uncommitted watch/design work in the shared checkout was kept.

- Web TypeScript/production build passes (existing lucide-react directive warnings).
- Web unit/deployment/credential checks: 23 pass. The child-process credential
  test required host execution because the sandbox denies spawnSync with EPERM.
- Edge Function handler suites: 56 pass, including verified Google identity,
  spoofed caller IDs, invalid account operations and atomic account pairing RPC.
- Deno checks the watch-access entrypoint against the committed lockfile.
- PGlite: existing RLS/pairing/purge and Notion suites pass; account recovery suite
  verifies a fresh session recovers without a code, two watches stay linked,
  unrelated accounts cannot list/restore/read recordings, conflicts roll back
  code consumption and grants, unlink revokes prior account sessions, and expired
  sessions/non-Google users/direct client calls are rejected. Source owner UUIDs
  stay unchanged. Auth table reads are deliberately denied to service_role in
  the fixture, matching the hosted permission boundary.
- Browser: account flows and existing portal regression suite pass in the shared
  HaptiLog Chrome. Includes mobile overflow, Google PKCE authorization initiation,
  anonymous identity linking, mocked callback code exchange before recovery,
  account save/failure, replacement pairing, sign-out and unlink. Auth/DB/network
  responses are mocked; Google itself is not contacted by these browser tests.

Read-only production checks confirmed `auth.sessions(id,user_id,not_after)` and
`auth.identities(user_id,provider)` exist, service_role cannot directly SELECT
these protected tables, and public Auth settings return `external.google=false`.
The existing hosted security advisor findings were inspected; these predate this
change and are not evidence that the new, unapplied migration passed a hosted
advisor run. No migration, function, or web deployment was performed.

Live Google OAuth client configuration, manual-linking enablement, exact portal
redirect allowlist, deployment and real-provider acceptance remain required.
See [setup and authorization design](../../architecture/google-account-recovery.md).

The requested design note was posted to
[Discussion #46](https://github.com/stlim0727/haptilog/discussions/46#discussioncomment-19180660).
