# Unified journal verification — 2026-10-26

Branch: `feat/stay-recording-unification` (base `e0e24d4`).

The two-round UX and product-marketing review is recorded in
[the design decision](../docs/design/2026-10-26-unified-journal-review.md).

## Automated evidence

- Web unit tests: 50 passed (`npm test` in `web`).
- Web browser regressions: 77 unique tests passed across two runs. The final run covered account/mobile/demo/pairing and all 13 unified-journal scenarios (43 passed). The earlier related-suite run passed the other 34 Notion/portal/place-management scenarios; its obsolete pairing-heading assertion was updated and passed in the final run. A final two-test mobile rerun also passed after map-title and duplicate-summary cleanup. Browser scenarios use mocked RPCs, not live backend synchronization.
- Web production build: passed (`npm run build` in `web`).
- Wear OS unit tests: 143 passed; debug APK assembly passed (`:app:testDebugUnitTest :app:assembleDebug --offline`).
- Location backend protocol test: passed (`node supabase/tests/location-stays.test.mjs` with existing test dependencies). This checks the SQL protocol in PGlite, not the deployed service.
- Source whitespace check: `git diff --check` passed.

## Screens and manual checks

`web/` contains desktop mixed-journal and settled light/dark mobile stay-detail screenshots generated from synthetic test data.

`watch/` contains paired screenshots and accessibility hierarchies from the existing 454×454 x86_64 Wear OS emulator. Verified start/stop and independent sync status with networking disabled, notification-denial recovery text, English/Korean strings, and scrolling/wrapping at 200% font size. The emulator already had a consented test account; live consent changes were not exercised. The unit test `syncCanBeEnabledAndDisabledWithoutStoppingCollection` covers enabling/disabling during an active local session and deferred place settings. Emulator network, font size, application locale and original notification denial were restored after checking.

No production deployment, database migration, physical-watch GPS accuracy, long-running battery usage or live end-to-end location upload is claimed by this evidence.
