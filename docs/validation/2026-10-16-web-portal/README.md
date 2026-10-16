# Portal implementation validation — 2026-10-16

- Web: production Vite/TypeScript build passes. Five browser acceptance tests pass using local Chrome and **mocked Supabase responses**: pairing/reload, persisted corrections and CSV download, retry from stored audio, clearing data after revocation, and desktop/mobile layout plus disconnect.
- `review-desktop.png`, `review-mobile.png`, and `pair-mobile.png` show those fixtures, not a live user's recordings. No demo records are shipped in the application.
- Handler checks: 14 enrichment tests and seven pairing tests pass with mocked provider/Auth clients. Deno checks both function entrypoints against the pinned lockfile.
- Embedded PostgreSQL executes all migrations and verifies ownership isolation, private audio access/upsert, code expiry/replay, guessing limits, session-specific grants, revocation, and separate correction writes. This uses test Auth/Storage schemas; it does not replace hosted Supabase acceptance.
- Android: debug build, lint, and seven unit tests pass. Installed the APK on the dedicated `wearos_round` API 34 x86_64 emulator. Navigated from the main screen to Web access, checked an offline code request, and inspected normal/1.3× text. Shortened long browser-control labels following that check. `watch-offline.png` shows the recoverable offline error. Display/network settings were restored and this emulator stopped.
- Cloudflare: production Wrangler configuration passes `deploy --dry-run --env production` from `web/`. No Worker, DNS record, or custom domain was deployed; this session has no Cloudflare login or API token.

Remaining acceptance: deploy migration/functions with the pairing secret, authenticate Cloudflare and publish, then verify real code issuance/redemption, browser session refresh, original audio playback, paid Gemini success/failure/retry, and physical-watch screen/haptic/battery behavior. Recovery after lost anonymous watch credentials is deferred as documented in the architecture.
