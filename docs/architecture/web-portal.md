# Standalone review portal

Implements the first review loop proposed in issue #2: pair a browser, review an uploaded watch recording, play its original audio, inspect enrichment, retry failed analysis, and retain human corrections.

## Hosting and domain

Use **Cloudflare Workers Static Assets** for the React/Vite SPA and **`haptilog.keepory.app`** as its production custom domain. This reuses the existing Keepory domain without sharing the Keepory application's origin or deployment. The existing Keepory Worker remains independent.

Supabase continues to host Auth, Postgres, private audio Storage, and Edge Functions. No Cloudflare database, R2 bucket, phone companion, or new Gemini key in the frontend is required. Cloudflare serves the application bundle; authenticated requests go directly to the HaptiLog Supabase project.

Workers is Cloudflare's recommended starting point for new applications, including static SPAs. The configured SPA fallback supports direct navigation. The subdomain is a recommendation encoded in deployment configuration; it is not a claim that DNS or deployment has already been completed.

References:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## Identity contract

The **recording owner remains the watch's anonymous Supabase user UUID**. The Watch ID is a human-facing locator, never a login secret. Each browser signs in anonymously with its own Supabase session and exchanges only a six-digit code for a session-specific grant. This deliberately differs from the RFC's proposal to mint a JWT for the watch owner: no custom JWT signing or copying watch refresh tokens is necessary.

`portal_connections` links the verified browser user and `session_id` to the watch owner for 30 days. Read policies allow the watch owner or that active browser session to access recordings, enrichments, processing status, and original audio. Browser access does not permit uploads, changes to source recordings, or privileged job operations. Corrections have their own write policies. Browser sessions refresh independently of the watch.

A watch issues a code explicitly through **Web access → Create code**. It expires in five minutes, is consumed atomically, and can be cancelled or replaced. The verifier is an HMAC using a separate key derived with HKDF from the server-only runtime credential (or an explicit `WATCH_PAIRING_SECRET` override); neither plaintext codes nor watch credentials are stored in the database. Issuance is limited to once per minute. Ten redemption attempts per browser user per 15 minutes bound code-only guesses. Legacy clients may still supply a Watch ID; five wrong guesses against that ID lock its pairing for 15 minutes, including new issuance. Supabase anonymous signup limits provide a further IP-based boundary. Production signup CAPTCHA can be added if abuse requires it; the current watch signup client does not implement a CAPTCHA challenge.

Codes use unbiased cryptographic randomness. A unique index reserves each non-null verifier across watches; issuance clears expired reservations and retries collisions with a new random code. Code-only redemption locates the watch by its verifier and consumes it under a row lock. Protected pairing state and counters live in an unexposed schema. Issuance, cancellation, and redemption RPCs are service-only. The Edge Function verifies the bearer token before using its user/session identity; the body cannot choose either identity. Authenticated clients cannot invoke those RPCs themselves.

The watch keeps the code screen awake for at most 60 seconds and clears that behavior when leaving the foreground. It also lists connected browser grants for revocation. Browser **Disconnect** revokes the grant before local Auth sign-out. RLS checks the grant on each subsequent request, so a still-valid JWT does not retain access to the watch's data after revocation. Already downloaded bytes cannot be recalled. An open portal rechecks grants every 15 seconds while visible and on return to the tab; revocation clears its displayed recording data and audio object URLs when detected.

**Recovery boundary:** existing paired browsers retain their grants until expiry/revocation, even if the watch is lost. Clearing the watch's application data loses its anonymous credentials; neither its public Watch ID nor a cleared browser can recover them. Email/Google elevation, durable account recovery, and migrating a replacement watch are deferred. The app fails closed on lost/corrupt watch credentials rather than silently changing owners. This release does not claim that account recovery is implemented.

Deploy the code-only pairing migration first, then the `watch-access` Edge Function, then the web bundle. Older watch builds can keep generating codes and older web clients can still send the Watch ID. The watch UI update removes the ID from the code screen; existing browser grants are unchanged.

## Processing and originals

`RecordingUploader` preserves the existing order: local durable audio → private Storage upload → recording metadata → enrichment. Rows still entirely on an offline watch are invisible to the portal. The UI therefore reports cloud check time and **watch offline queue unknown**, never “all synced.”

`enrichment_status` is an owner-scoped read model separate from service-only claim tokens. It stores start/finish timestamps, attempt count, a sanitized failure code, and the public lease deadline. An expired processing lease displays **Interrupted**. No status/result with an audio path displays **Awaiting analysis**. A failed new analysis can coexist with an older successful result; original audio remains available.

`voice-enrich` accepts a recording ID, authorizes it through the caller's RLS context, and downloads its canonical Storage object. Older watches may still send their old base64 request, but caller bytes do not replace the persisted original. The handler writes output under the recording's owner, not the browser's user ID. Provider payloads use only the selected original and capture context.

Existing per-recording leases prevent overlapping requests and a 30-second start cooldown bounds immediate retry loops. `PIPELINE_VERSION` defaults to `v1`. Completed requests for that version reuse output; changing the server version allows a new result without deleting prior versions. A browser can retry unavailable/failed analysis; arbitrary user-selected pipeline versions and a “force successful analysis again” button are deferred. Pipeline version should be incremented when model/prompt behavior changes.

## Corrections and summaries

Human expense corrections and task completion live in `recording_corrections`; generation never modifies that table. Amount/currency, merchant/category, and completed action text survive reload and reanalysis. Task completion follows exact action text: a changed generated task is a new item, and duplicate identical tasks share completion.

Expense totals use only valid non-negative amounts and three-letter currency values and group each currency independently. Missing amount/currency is excluded and counted explicitly. Date filters use the browser's timezone. Feed, filters, totals, and CSV currently cover at most the latest 500 uploaded recordings; the UI discloses that limit. Pagination is a follow-up before presenting full-history analytics to larger accounts. CSV escapes quotes/newlines and neutralizes spreadsheet formula prefixes from untrusted generated text.

Audio uses a private JWT-authorized download into a transient browser object URL, with native playback/scrubbing, playback speed, and `.m4a` download. There is no offline cache or public audio URL. Coordinates remain numeric snapshots with accuracy/altitude/speed when available; no inferred places or tracked routes are asserted.

## Deployment

1. Keep the published `20261016143551_web_portal.sql` unchanged, then apply `20261016160030_portal_privileges.sql`. The follow-up narrows hosted default grants and is safe for existing PR #3 installations. All pairing RPCs and job status writes must remain service-only. Review database advisors after migration.
2. Keep anonymous sign-ins enabled. Pairing derives its key from the injected server-only runtime credential, so no extra secret is required. Optionally set `WATCH_PAIRING_SECRET` (at least 32 random characters) for independent rotation. Rotating the source credential or override invalidates outstanding codes. Keep existing `GEMINI_API_KEY` and `GEMINI_MODEL` configured for analysis.
3. Deploy **both** `watch-access` and `voice-enrich`. Deploy backend before distributing the new watch build: new watches send ID-only enrichment requests. Original deployed watches remain compatible with the updated function.
4. In `web/`, copy `.env.example` to ignored `.env.local`; configure the HaptiLog project's URL and **publishable key only**. Run `npm ci` and `npm run build`. The two `VITE_` settings are embedded public configuration, not secret bindings. Never put service-role or Gemini credentials in them.
5. Authenticate Wrangler to the Cloudflare account that owns `keepory.app`. A first preview deployment uses `npm run deploy` and the independent `haptilog-web-preview` Worker. Production uses `npm run deploy:production`, targeting the separate `haptilog-web` Worker and custom domain `haptilog.keepory.app` declared under `env.production` in `wrangler.jsonc`. Cloudflare creates the custom-domain DNS/certificate when the zone is on that account; an existing conflicting subdomain record needs resolution before activation. This configuration does not alter the apex Keepory Worker.
6. For Git-connected Cloudflare builds, use root `web`, install `npm ci`, and deploy `npm run deploy:production`, with both public Vite settings present during the build. The deploy script validates the publishable/anon key before network access, checks live Auth/pairing/analysis readiness, then builds before uploading. Cloudflare credentials are removed before readiness/build dependencies load and are passed only to Wrangler. It reads public Vite settings from the process environment, production `.env` files, or the checked-in watch public configuration, in that order. Keep preview and production settings explicit.

   Alternatively, run the **Deploy review portal** GitHub workflow after configuring repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The account must own the `keepory.app` zone and the token needs Worker deployment and custom-domain permissions. In CI, `npm run prepare:deploy` validates readiness and builds with the resolved public configuration but never invokes Wrangler. Credentials and their non-empty checks exist only in the final direct Wrangler publishing step; install, tests, readiness, and build run without them. No Supabase service credential or Gemini key goes to Cloudflare.

   Run `npm run check:backend` from `web/` to check the three backend prerequisites without creating users or invoking Gemini. The function health probes report configuration readiness only; a paid live analysis still needs acceptance testing.
7. Install the new watch build. Its URL defaults to `https://haptilog.keepory.app`; override `HAPTILOG_WEB_PORTAL_URL` at build time for a different host.
8. Perform a real watch → browser test: offline capture, restart, reconnect/upload, code pairing, original playback, provider failure/retry, session refresh, correction retention, and browser revocation. Automated browser tests use mocked Supabase responses; they do not prove a live pairing or paid Gemini request.

No email/OAuth redirects are used by this pairing flow. A future account elevation flow must configure its own production redirect allowlist.

## Validation

```sh
node --experimental-strip-types --test tests/voice-enrich.test.mjs tests/watch-access.test.mjs
npm ci --prefix supabase/tests --ignore-scripts
npm test --prefix supabase/tests
deno check --lock=supabase/functions/deno.lock supabase/functions/voice-enrich/index.ts supabase/functions/watch-access/index.ts
npm ci --prefix web
npm test --prefix web
npm run build --prefix web
cd web && npx playwright install chromium && npm run test:e2e
```

Use `CHROME_PATH=/opt/google/chrome/chrome npm run test:e2e` to reuse a locally installed Chrome. Android build/unit checks remain `./gradlew assembleDebug testDebugUnitTest` from `watch/`.
