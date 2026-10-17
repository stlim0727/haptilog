# Watch navigation and support review — 2026-10-17

The UX director reviewed the source and round-watch screenshots using clarity, restraint, and discoverability as criteria. This is a design review inspired by those principles, not a review by Jony Ive.

The previous layout placed Web access after every recording. The revised layout keeps the record control primary and places Web access and Settings & help ahead of the recording list. Web access is also available inside Settings. Settings shows the installed version name and build number offline. Open Play Store delegates update availability to the watch store rather than asserting that an update was checked.

The initial screen keeps the full Record control visible. Scrolling reveals navigation before the first recording. The screenshots are from a diagnostic debug build (1.1.0, build 1), not evidence of an installed Play release.

## Reporting contract

Manual issue reports include the user's description and technical app/build, Android API, and watch-model metadata. The watch stores up to ten small reports in its private support directory and reports local acceptance as saved, waiting to send. Reports retry online independently of recording sync. The description/mode survive activity recreation; an unsuccessful save retains the draft. Support failures never mutate recordings.

Crash reporting is off by default. Opting in captures only uncaught JVM exception class names and up to four causes with bounded app stack frames. Exception messages, file paths, thread names, audio, transcripts, GPS, pairing codes, and tokens are excluded. No network request is made in the crash handler. The original Android handler is always invoked; upload happens via constrained WorkManager work after the next app start. Turning off deletes queued crashes, leaves manual issues intact, and does not retract an upload already in flight.

This app-level handler does not collect native crashes or ANRs. Google Play Android vitals remains the platform source for those where data is available. R8 mapping is retained with the bundle and uploaded to Play to make platform crash stacks readable. App class names/line numbers are retained for the minimal self-hosted reports.

## Support operations

Reports arrive in the existing HaptiLog Supabase project, public.app_reports. RLS permits authenticated owners to insert only; clients cannot read, update, delete, spoof another user, or set the server timestamp. Operators inspect reports through privileged tooling. Reports are private support inbox entries, not public GitHub issues and not an automatic alerting integration.

Example operator query (descriptions are user-controlled data):

```sql
select id, kind, description, diagnostics, created_at
from public.app_reports
order by created_at desc
limit 50;
```

Before broader distribution, reconcile Play Data safety and the public privacy notice with optional crash diagnostics and user-submitted support text. This work does not claim those console declarations were updated. There is no automatic server retention job; operators should periodically delete reports no longer needed.

## Validation

- assembleDebug, lintDebug, and all 13 unit tests passed.
- Six support tests cover default-off consent, message/path/foreign-frame redaction, durable failed upload and retry identity, duplicate acknowledgments, selective opt-out deletion, queue bounds and recording preservation, and handler delegation.
- Embedded Postgres tests include insert-only reporting under broad hosted default grants, owner spoofing denial, signed-out denial, and payload bounds.
- Hosted rollback-only insert succeeded; live grants confirmed anon insert false, authenticated read false, and server timestamp insertion false.
- Round Wear OS 5 x86_64 emulator, 454×454 at 320dpi; installed APK includes native x86_64 libraries.
- Real emulator issue submission while offline showed “Saved on watch … Waiting to send”; after reconnecting, the same report UUID arrived in the hosted inbox and the local queue emptied.
- Opted into crash reports through the watch UI, used `adb shell am crash com.haptilog.watch` only against the diagnostic emulator build, and reopened the app. Android's fatal crash log was preserved. The hosted crash report contained only exception type, empty app-frame array (system-induced crash), app/build, device model, and Android API. The shell error message was absent. Both synthetic hosted test reports were then deleted.
- Final Settings → Web access navigation succeeded. At font scale 1.5, the Settings title, installed version/build and Web access label remained readable on the round display (settings-font-1.5.png). No dictation capability is claimed; the issue composer uses the available Wear input method.
