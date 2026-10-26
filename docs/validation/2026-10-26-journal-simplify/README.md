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

Cloud upload and withdrawal were not exercised on device: the location migration is still unapplied
to the hosted Supabase environment (release task 1 in
[`docs/design/location-stays-followup.md`](../../design/location-stays-followup.md)), so there is no
server side to talk to yet. The single-consent derivation and the flag reconcile in both directions
are covered by `LocationConsentTest`; the worker's idle guard itself is not unit-tested because
`androidx.work:work-testing` is not a dependency of this module. Actual battery drain against the
previous baseline also remains an open release measurement.

## Checks

`./gradlew assembleDebug lintDebug testDebugUnitTest` passed: 147 unit tests, 0 failures, 0 skipped.
