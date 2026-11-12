# UI Screens Flows

Last updated: 2026-11-12.

Two manual-dispatch workflows capture the product's UI screens showcase, one per surface.
Both follow the same contract (modeled on flight3d's `UI Screens` workflow):

- `tier` input (`core` / `full` / `all`) selects which screens are captured; lower tiers
  merge into the existing `catalog.json` instead of rewriting it.
- `publish` input: off = verify-only run (screenshots land in a temp dir, uploaded as the
  run artifact, nothing committed); on = write into the repo, commit, and push.
- Catalog entries carry bilingual metadata (`title_ko`/`title_en`, `description_ko`/
  `description_en`, `selector`, `tier`) plus branch/commit provenance.

## Web portal — `UI Screens (Web)`

- Workflow: `.github/workflows/ui-screens-web.yml`
- Script: `web/scripts/capture-all-ui-screens.mjs`
- Output: `web/public/screenshots/ui/` (PNGs + `catalog.json`); publishing also dispatches
  `deploy-portal.yml` so the portal ships the new screens.
- Deterministic: no live backend. The script boots Vite with the e2e test origin
  (`https://haptilog-test.supabase.co`) and reuses `web/e2e/portal-fixture.ts` route mocks;
  workspace screens use the preview demo sample data, auth screens use the mock session.
- Screens: pairing login, workspace list+detail, timeline & map, account panel (core);
  calendar, trash, category+search, Korean UI (full); Notion export, enrichment-failure
  retry (all). Desktop viewport by default; `--viewport mobile-portrait|mobile-landscape`
  supported for local runs.

Local commands (from `web/`):

```bash
npm run test:ui-screens                     # verify all tiers, no repo writes
npm run capture:ui-screens -- --tier core   # publish-mode capture
```

## Wear OS app — `UI Screens (Watch)`

- Workflow: `.github/workflows/ui-screens-watch.yml`
- Script: `scripts/capture-watch-ui-screens.py`
- Output: `screenshots/watch/` (PNGs + `catalog.json`).
- Runs on a disposable Wear OS 5 (API 34) round emulator (`system-images;android-34;
  android-wear;x86_64`, `wearos_large_round`, KVM) built by the workflow: it installs the
  debug APK, then drives the app with the uiautomator + `screencap` recipe proven in
  `docs/validation/ux-phase1` (offline, cloud declined, permissions pre-granted).
- Screens: home idle, recording active, recordings list, recording detail (core);
  paused state, cloud consent, settings, web access, location journal (full);
  delete confirmation, 192dp/200%-font stress home+list (all).
- The script resets app data and toggles wifi/data/font/display settings and restores
  them at the end. Refuses any non-emulator adb serial.

Local run (repo root, on a disposable debug emulator only):

```bash
python3 scripts/capture-watch-ui-screens.py --tier all --verify   # temp output, no repo writes
python3 scripts/capture-watch-ui-screens.py --tier core           # publish into screenshots/watch
```

## Adding a screen

Append a metadata entry (web: inside the matching session block; watch: `SCREENS` list)
with a unique zero-padded `id`, a `tier`, and bilingual titles, then capture it in the
flow. Keep IDs stable — the tier-merge logic keys on them.
