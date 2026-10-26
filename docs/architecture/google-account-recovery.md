# Google login and watch recovery

Google login is an optional durable identity for the web portal. Watch capture
continues to use its existing anonymous identity. Raw recording owners, audio
paths, timestamps and GPS are never migrated or rewritten.

## User flows

- A new browser can sign in with Google, then enter a watch code. Successful
  redemption atomically creates the normal session grant and saves the watch to
  that Google account. A watch can belong to only one account.
- An existing anonymous paired browser uses `linkIdentity` to upgrade its own
  identity, preserving its session grant. After OAuth, the user explicitly saves
  the current watch to the account. If Google is already registered to a different
  HaptiLog identity, use the existing-account sign-in action and re-pair with a new
  watch code. We do not silently merge identities or copy credentials.
- A returning Google user can recover uploaded records without the old watch or
  old browser storage. Recovery reissues a normal 30-day `portal_connections`
  grant for the new authenticated session. Existing RLS, Storage access, edits,
  deletion and Notion export continue to authorize through that session grant.
  Restore renews a grant that is still live and creates one for a session that
  has no grant yet; it never clears a revocation.
- Account & watches lists saved watches. Selecting a watch changes the active
  session grant, clears loaded recordings and unmounts the prior editor/player.
  Connect a new watch adds a replacement while retaining old watch links.
- Sign out and Disconnect browser preserve durable account links. Unlink watch
  removes that account's durable link and revokes all its browser grants for the
  watch. Other explicitly paired browsers remain independent. Watch-side browser
  revocation revokes a session, not the account recovery link. That revocation
  holds for the session: reloading the portal does not restore it, and granting
  that browser access again requires a new watch code.

Only uploaded recordings from previously linked watches can be recovered.
Google login cannot recover audio lost with an uninstalled app or missing watch,
or reconstruct anonymous credentials lost before any durable account link.
Recovery opens old records in the portal; it does not download them to a new watch.

## Authorization

`private.account_watches` is unexposed, RLS-enabled and service-only.
`manage_watch_account` and `redeem_account_watch_code` are invoker RPCs callable
only by service_role. The watch-access handler verifies `getUser(token)` and
extracts the session from that verified token, ignoring caller-supplied IDs.

A narrowly scoped, unexposed definer predicate checks `auth.sessions` (including
`not_after`) and the actual Google identity in `auth.identities`; hosted
service_role has no direct SELECT grant on those tables. User metadata is never
an authority. A transaction advisory lock serializes save, restore and unlink.
Conflicting Google-account redemption rolls back both code consumption and the
browser grant. Ordinary anonymous browser-code access remains available.

## Deployment prerequisites

1. Apply `20261025162642_google_account_recovery.sql`, then deploy `watch-access`,
   then the web bundle. This is additive and preserves existing browser grants.
2. Create/configure a Google Cloud **Web application** OAuth client. Register the
   Supabase callback `https://pejblunajspvgxavvieu.supabase.co/auth/v1/callback`
   as an authorized redirect URI and the portal origin as an authorized origin.
   Configure Google consent-screen audience/test users as appropriate.
3. In Supabase Auth → Providers → Google, enable Google and set its client ID and
   secret. Secrets belong in Supabase/Google configuration, never the web bundle,
   source control or issue comments. Enable manual identity linking in Auth.
4. Add the exact production portal root URL to the Supabase Auth redirect
   allowlist and set the Site URL. The SPA uses PKCE and redirects to its own
   origin root. Allow local `http://127.0.0.1:4178/` only for development.
5. Verify Google sign-in, anonymous upgrade/save, existing-account conflict,
   new-browser recovery, replacement-watch pairing, account switch, sign-out,
   unlink and denied access from an unrelated account against the live provider.
   Mocked browser tests do not establish real Google OAuth success.

At implementation time (2026-10-25), the production public Auth settings reported
`external.google=false`. No Google client credentials were available in the
session environment. Production OAuth activation and deployment remain pending.

References: [Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[anonymous identity upgrade](https://supabase.com/docs/guides/auth/auth-anonymous),
[linkIdentity](https://supabase.com/docs/reference/javascript/auth-linkidentity).
