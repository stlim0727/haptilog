# Continuous raw location validation — 2026-10-27

Branch `feat/raw-location-map`, base `379bca2`.

- Android: `lintDebug testDebugUnitTest assembleDebug` passed; 158 unit tests,
  zero failures/errors/skips. Five raw-specific tests verify stationary fixes
  before thinning, durable process recovery, lost ACK/idempotent resend, exact
  ACK validation, consent replacement, withdrawal and pending-source retention.
- SQL: full Supabase PGlite migration/RLS suites passed, including new raw tests
  for legacy-consent rejection, browser write denial, expired browser sessions,
  wrong-owner reads, batch rollback, content conflicts, bounded pagination,
  withdrawal/re-consent, expiry and source deletion barriers.
- Web: build and unit tests passed. Raw developer-map E2E passed at 1280px and
  390px with three non-recording sensor fixes, a missing sequence, accuracy 800m,
  missing altitude and zero speed. Map tile failures leave source inspection
  usable. No horizontal dialog overflow. Server raw deletion clears the map.
- Existing mobile regression: 14/15 passed in the broad run. The keyboard
  download-options test timed out once while focus was on the detail heading;
  the exact same test passed standalone on rerun (2.9s), without a code change.
  Narrow English/Korean layouts, 200% text, map, rotation and draft checks passed.
- Wear emulator: Android 34 Wear OS x86_64 `wearos_round`, KVM, matching x86_64
  APK native library; boot/ADB/package-manager gates passed. External network was
  disabled before app launch and remained disabled throughout this check.
  MainActivity resumed the previously selected Always scope. Injected emulator
  locations created three distinct immutable `files/raw_location/sample_*.json`
  files. The same three filenames remained after `am force-stop` and relaunch.
  No cloud grant was fabricated and no original location was uploaded to a remote
  service during this check.
- Watch Settings exposes the explicit original-location scope upgrade. With
  common cloud off, the disclosure explains the prerequisite and approval is
  disabled. The screenshot and XML record the visible round-screen rendering.

`web-raw-map-390.png` and `web-raw-map-1280.png` use test-only coordinates and a
failed tile layer. `watch-raw-disclosure.png` / `.xml` show the emulator UI.
These checks do not establish physical GNSS/battery behavior or production
end-to-end delivery. The database migration, portal and watch build are not
published by this task. See `docs/development/raw-location-map.md` for activation.


## Daily/hourly dot timeline follow-up

Web unit tests: 58 passed, including half-open interval boundaries, aggregation,
empty selections and DST (23/25 hours with distinct repeated-hour offsets).
Web build passed. `raw-location.spec.ts` and `raw-timeline.spec.ts`: four E2E
checks passed at 1280px and 390px. Tests verify daily ranges expanding the hourly
axis, keyboard/touch-capable native sliders, pointer brushing, matching map and
inspector subsets, empty-range clearing and no client exceptions. Range changes
fit the selected locations without Leaflet zoom-transition teardown errors.

`web-raw-timeline-390.png` / `web-raw-timeline-1280.png` show the two horizontal
dot rails. The daily overview scrolls the selected day into view; the hourly
rail shows its observations and selected brush interval. Capture/sync guidance
is collapsed so the timeline appears before setup detail. No backend/watch or
production deployment changes are part of this follow-up.


## PR #101 review fixes

Both reported deletion/retention regressions were reproduced against the original
migration before fixing them. Added SQL regressions verify:

- A two-hour stay can expire while a later raw fix remains younger than seven
  days. Daily cleanup removes the summary and preserves the raw fix; retrying the
  fix is idempotent and creates no source exclusion. Explicit stay deletion still
  suppresses its source interval through the existing deletion tests.
- A fix accepted with a watch clock 60 seconds ahead is deleted and retried after
  a lost ACK at the refreshed epoch. It remains deleted by its owner-scoped ID.
  A distinct post-deletion fix with the same timestamp remains accepted, and a
  different owner can use the same UUID independently.
- Deleted-ID metadata is client-inaccessible and contains no coordinates. Its
  expiry equals the source observation time plus seven days. Daily cleanup drops
  expired markers while preserving live deletion protection.

Validation: full `npm --prefix supabase/tests test` migration/RLS suites.

## Developer GPS + stay sample follow-up

- Web build and 59 unit tests passed. Fixture tests validate source values,
  linked capture sessions, non-future observations (including just after midnight),
  observation-gap segmentation and half-open stay overlap.
- Ten desktop/mobile E2E tests passed across sample login, raw map, timeline and
  developer stay scenarios. Samples and server data switch independently; raw
  ingestion being unavailable still permits separately synchronized stay display.
- Sample-mode checks verify four stay summaries and regions, orange boundary
  dots, source inspection, range exclusion, absence of server deletion controls,
  zero raw-location RPC requests, and narrow-screen containment.
- Final stay/map layout was rechecked with the three stay-specific E2E tests.
  `web-developer-stays-*.png` and `web-developer-stay-map-*.png` show synthetic UI
  evidence. No sample data is uploaded to Supabase.
