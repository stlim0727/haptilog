# Simplified location journal — 2026-10-26

Device pass for the consent and screen collapse on `fix/watch-simplify-stay-journal`.
Round Wear OS 5 (API 34) x86_64 emulator, 454×454, diagnostic debug build.

## What was checked

- `settings-location-chip.png` — Settings keeps one location entry, **Location journal**
  ("Places, visits and time spent"). The second **Places and stay sync** chip is gone; the next
  chip after the journal is Notifications.
- `start-permission-prompt.png` — one press of **Start location journal** produced the system
  precise-location prompt and nothing else. No disclosure page, no policy-version text, no
  backfill question, no "stop the journal first" gate.
- `journal-running.png` — after granting, the same screen reports *Location journal is running*
  with a **Stop** control and the latest accepted fix. No navigation was needed to start a session.
- `journal-stopped-with-stay.png` — after **Stop**, the screen keeps the stay list: state label,
  containing place name, observed minutes and the time range. History survived the stop.

## Notification-declined case

With `POST_NOTIFICATIONS` denied and the app's notification importance at `NONE`
(`dumpsys notification` reported `importance=NONE userSet=true`), a session started and was still
*running* after 70 seconds, past the service's 30-second condition re-check, with the latest-fix
timestamp advancing. Previously the same state aborted the session at the next re-check.

## Not covered here

Cloud upload and withdrawal were not exercised on device. The synchronization backend is applied in
production, so the server side exists, but the switch this change rides on is the same one that
starts uploading audio: turning it on for a paired watch sends that watch's retained recordings as
well as its stays. That pass is left for the owner to run against real data, together with the
battery-drain measurement against the previous baseline.

The single-consent derivation and the flag reconcile in both directions are covered by
`LocationConsentTest`; the worker's idle guard itself is not unit-tested because
`androidx.work:work-testing` is not a dependency of this module.

## Checks

`./gradlew assembleDebug lintDebug testDebugUnitTest` passed: 147 unit tests, 0 failures, 0 skipped.

## Review follow-up: sync correctness

The three inline review findings were repaired after the original emulator pass:

- Incomplete place imports resume even when the server flag already matches. A partial upload never becomes an authoritative replacement for retained local places.
- The worker obtains one complete post-import snapshot before applying/acknowledging settings, keeping its revision and place contents coherent.
- Pending withdrawals stored as `revoke_pending` are translated before the new off-and-idle guards; failed withdrawals retain the pending work.

Three regression tests cover partial-import retry, coherent first-import application/acknowledgement, and old-marker withdrawal through a network failure. After isolating the in-process repository between tests, all 150 unit tests, `lintDebug` and `assembleDebug` passed locally.

This validates the correctness fixes, not selection of this PR's shared audio/location consent policy. The independent-consent consolidated alternative is #84; this branch remains a draft pending the cross-PR decision. No production merge or live data upload was performed for this follow-up.
