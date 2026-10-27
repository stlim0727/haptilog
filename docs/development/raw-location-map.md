# Continuous raw location developer map (#100)

Implementation branch: `feat/raw-location-map`, based on main `379bca2`.
This lane uploads actual periodic watch sensor observations before v1 movement
thinning and stay classification. It does not reconstruct trails from recordings
or `history.json`, and does not activate the full server stay-inference/cadence
pipeline proposed in `location-capture-v2.md`. Existing v1 stay processing remains.

## Use and deployment order

1. Apply the `raw_location_debug_sync` migration and confirm the existing daily
   `cleanup_location_stays()` job is configured. It now also purges raw samples
   and expired source exclusions. No new secrets or Edge Function are required.
2. Publish the compatible portal, then install the new watch build. An older
   backend refuses the new raw grant; ordinary audio/stay sync remains usable.
3. Watch Settings: enable common Cloud sync, explicitly approve **Sync continuous
   location originals**, and set Location recording to **Always**. Old consent
   never authorizes precise raw uploads. New raw approval starts a future-only
   window; no historical raw/backfill is fabricated. Declining leaves v1 working.
4. Connect the watch to the portal and choose **DEV** in the header. Choose an
   observation date in the browser's timezone, select fixes on the map or in the
   keyboard-accessible select, and inspect source values. The map refreshes every
   30 seconds while visible; uploads target 15-minute WorkManager intervals,
   subject to battery/network/background constraints, with a constrained stop
   flush. This is not live tracking.

## Contracts

- Each valid callback fix (including stationary fixes and accuracy >100 m) is
  committed atomically in private `raw_location/sample_<uuid>.json` before the
  v1 detector. IDs, session sequence, coordinates, UTC/monotonic times, capture
  age and availability of altitude/speed are immutable. Repeated/stale/invalid
  sensor deliveries are excluded. Cached initial-display fixes are not originals.
- Capture session UUID is shared with the v1 stay detector for source suppression;
  a process restart starts a different session. Source files survive process
  death. ACK files record exact server outcomes separately; lost ACKs resend the
  identical IDs/content. No audio, network call or wake lock enters capture writes.
- Automatic raw upload uses a separate constrained worker. Each batch rechecks
  local consent, binds the original capture-time owner/grant and limits to 100
  samples / 256 KiB. Server authorizes the authenticated owner, locks the same
  location state as consent/deletion, rejects content conflicts and rolls invalid
  batches back. Browsers cannot ingest watch samples or grant raw consent.
- Disabling common sync cancels raw work/requests and clears the local grant.
  Common server withdrawal invalidates the raw grant; legacy re-enable does not
  restore it. Re-consent never reassigns old queued sources to a new grant.
- Source-time retention is seven days. Expired and consent-excluded/deleted
  results are explicit terminal outcomes. Pending consented files are not evicted
  by local retention. At 20,000 files, collection stops through the existing
  storage-error path, preserving sources and independent voice capture. Terminal
  files are pruned during capture/sync; app removal clears local files.
- Only the owner or an active paired browser can read the private raw table,
  through a bounded RPC (one local day, 1,000 rows/page, cursor by time+ID). The
  UI rejects a deletion-epoch change across pages and clears unauthorized data.
  No raw data is persisted in browser storage or forwarded to Gemini.
- All-source raw deletion has a persistent time barrier against unknown offline
  samples. A stay deletion also removes/suppresses that session's source interval.
  Existing all-stay deletion's owner barrier applies to raw ingestion and reads.
- Lines show adjacent observations only: session changes, missing sequences,
  >180-second gaps, reversed monotonic clocks, and >5-second UTC discontinuities
  split the display. Accuracy circles are selected-fix uncertainty; lines do not
  prove the physical route between fixes. Missing sensor values stay missing.

## Validation

Run `npm --prefix supabase/tests test`, `npm --prefix web test`, the web build,
`raw-location.spec.ts` desktop/mobile E2E, and watch `testDebugUnitTest` plus
`assembleDebug`. Raw-specific tests cover pre-filter stationary capture, durable
recovery/lost ACK, exact ACK validation, old consent exclusion, withdrawal,
owner/browser isolation, atomic conflicts, expiry, deletion barriers and keyset
pagination. Record emulator evidence alongside this document before release.

Real-watch battery/GNSS/background delivery and production deployment are separate
release checks. Emulator observations do not establish physical sensor fidelity.

## Two-level dot timeline

The date control anchors a seven-calendar-day overview in the browser timezone.
The first horizontal rail renders one dot per observed hour (dot size indicates
fix count), including blank days. Selecting a day range expands the second rail
into its actual hourly intervals. The second rail renders each observation at its
measurement time. Repeated daylight-saving hours have distinct UTC-offset labels.

Drag across either dot rail, click its labels (Shift+click expands a range), or
use the native start/end sliders with touch or keyboard. Day selection resets the
hour selection to the complete selected days. Hour boundaries filter with
`start <= observed_at < end`. Only that subset appears in the map and source
inspector; an empty interval clears both. The map fits a newly chosen interval
without resetting pan/zoom on background refresh of the same interval.

The portal reuses the bounded day-read RPC for the seven days and rejects mixed
deletion epochs before displaying a combined snapshot. This UI increment needs
no database or watch change. Timeline unit checks cover boundaries, empty ranges,
23/25-hour days and repeated-hour labels. Desktop/mobile E2E checks cover day and
hour ranges, keyboard selection, pointer brushing, map/inspector counts, empty
states and horizontal containment.


The map toolbar has **Chronological line · ON/OFF** (default ON). It changes only
connection lines; selected fixes, accuracy circles, time ranges and the current
map view are retained. Turning lines on still respects session/sequence gaps and
clock discontinuities. The control supports pointer and keyboard activation.
