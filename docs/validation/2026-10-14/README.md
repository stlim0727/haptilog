# Durable recording and sync validation — 2026-10-14

## Automated checks

- Android debug build, release build with R8, and lint passed.
- Seven Robolectric tests passed: crash/orphan recovery, completed-source immutability, ZIP contents, resume after upload/provider failure, stable owner identity, and excluding interrupted capture from upload.
- Ten Edge Function tests passed: authentication/ownership, request bounds, validation, persistence errors, provider errors, cached retries, and lease contention/release.
- Embedded PostgreSQL applied both migrations successfully. Ownership isolation, private Storage upload replacement, server-only enrichment writes, uniqueness, and expired lease takeover passed.
- Deno typecheck passed with the pinned dependency lockfile.

## Connected Supabase project

Project: `haptilog`, `pejblunajspvgxavvieu`.

Both migrations are applied and `voice-enrich` is deployed. Local migration filenames match the remote migration history. Rollback-only live assertions verified owned-row visibility, rejection of foreign insertion/access, and denial of authenticated access to the claim RPC. The live function rejects unauthenticated requests with HTTP 401.

The security advisor reported only the intentional informational finding that the server-only `enrichment_jobs` table has RLS and no client policies. Authenticated/anonymous roles have no access; the server role is explicitly granted access.

The anonymous signup smoke test returned HTTP 422, `anonymous_provider_disabled`. Anonymous Sign-Ins must be enabled, and `GEMINI_API_KEY` / `GEMINI_MODEL` must be configured in Edge Function secrets, before an end-to-end live upload/enrichment test can succeed. No paid provider call was made during these checks.

## Wear OS emulator

Wear OS 5 / API 34, round 454×454 screen, x86_64 APK native library matching the emulator ABI, KVM acceleration.

- Found and fixed a startup SecurityException caused by Wear Compose 1.4.0 reading the restricted reduce-motion setting. Version 1.4.1 resolves it.
- Confirmed microphone/location foreground recording service starts while the activity is visible.
- Captured a 66-second offline recording. The 271,600-byte `.m4a`, original metadata, location fields, and `COMPLETED`/`PENDING_SYNC` state survived force-stop and cold restart. Recorder service was stopped after completion.
- Abruptly killed another active capture. The 16,033-byte raw file remained and startup changed its state to `INTERRUPTED` / `RECOVERY_REQUIRED`; it is not eligible for automatic upload. A partial MP4 is not guaranteed playable.
- Checked recording-list layout at default and 1.3× font scales. Screenshots contain synthetic emulator recordings and emulator location values.
- Export packaging was validated in Android tests. The Wear OS image resolves document export to a framework stub; actual export requires a compatible picker on the physical watch. Unsupported/cancelled export retains source files.

## Physical acceptance still required

No physical watch was connected. Verify haptic feel, microphone interference, speaker/Bluetooth playback, timeout behavior with the screen off, battery impact, and system export support on the intended Galaxy Watch. Emulator and JVM tests do not establish those results.
