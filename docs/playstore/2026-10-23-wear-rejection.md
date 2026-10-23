# Wear OS review rejection — 2026-10-23

The owner-provided Google Play email rejects `com.haptilog.watch`, version code **13**. It identifies missing scrollbars and large-font text clipping under Wear app quality. The Korean large-font sentence is phrased as an expected requirement; this is a layout/accessibility finding, not evidence of a broken backend feature.

- [#31: missing scroll indicators](https://github.com/stlim0727/haptilog/issues/31)
- [#32: large-font clipping](https://github.com/stlim0727/haptilog/issues/32)
- [Official requirements](https://developer.android.com/docs/quality-guidelines/wear-app-quality): WO-V8 (scroll bar), WO-V1 (user font size), WO-V16 (watch shapes).

The email references `IN_APP_EXPERIENCE-8319.png`, but the supplied PDF contains its filename only. The review screenshot itself was not available, so the exact screen Google captured cannot be established.

## Changes

Web access previously had a scrollable list without an indicator or rotary handling. It now uses one remembered list state for the list, `PositionIndicator`, and rotary scrolling. Main and Settings already had indicators.

Action chips now use intrinsic content height, multiline labels, full available width, and a minimum 52dp height. Settings toggles also grow to their content. Recording detail actions are stacked vertically, list-card timestamps and duration occupy separate lines, and the recording disc grows with the user's font setting. The list keeps its deliberate one-line summary preview; the full summary remains available in recording details. Text keeps system `sp` scaling. The current-main recording detail navigation and map action are preserved.

## Earlier verification (before porting to current main)

`JAVA_HOME=/home/stlim/.local/share/jdk17 ./gradlew assembleDebug lintDebug testDebugUnitTest` passed on the final source. All 21 unit tests passed; lint completed with existing warnings. `git diff --check` passed.

Wear OS 5 / API 34 x86_64 emulator checks used its native 454px / 320dpi display (227dp) at font scale 1.0 and an overridden 384px / 320dpi display (192dp) at font scale 2.0. Screenshots and hierarchy evidence are in `docs/validation/2026-10-23-wear-policy/`. The final APK was reinstalled and the enlarged recording control was also inspected at 192dp; its RECORD label fits inside the disc. Confirmed Settings scrolling and its existing indicator, Web access scrolling and its new indicator, and a centered “Create code” button wrapping to two complete lines with increased height. A partially visible list item at the viewport edge is expected while scrolling; the action was checked centered in the viewport.

These checks do not establish Play approval. Full live pairing/revocation, cloud consent submission, report upload, populated recording-card states, rotary hardware, and physical Galaxy Watch acceptance remain release checks. No real user recording or cloud upload was created for these screenshots.

## Current-main integration

The PR is based on current main, including the recording-detail and map-link changes. The earlier screenshots document the first implementation, before that port. The current-main implementation passed `assembleDebug lintDebug testDebugUnitTest` with all **31** tests passing. PR CI also passed Wear OS, backend/migrations, portal/browser tests, and the Cloudflare build. Automated code review completed without findings on commit `102efbd`.

New emulator evidence is in `docs/validation/2026-10-23-wear-policy/current-main/`. The new offline emulator recording was given synthetic derived summary/transcript text to exercise details; its original audio and capture metadata were unchanged across force-stop/restart (SHA-256 comparison recorded alongside screenshots). The current-main list and detail flow were inspected at 192dp with 2× fonts. Earlier screenshots outside that directory still document the first implementation.

No cloud upload was performed for the new recording. Live provider operations, physical rotary/haptic calibration, and Google Play approval are not established by the emulator checks.

## Release follow-up

1. Finish native UI validation on default and enlarged system fonts, including the smallest supported 192dp round display. Exercise main/recording cards, settings, cloud disclosure, issue reports, and web access (including pairing and revocation states).
2. Build a signed release from the reviewed change with a version code higher than 13 and higher than every previously uploaded code. The default local debug version code is not a release recommendation.
3. In Play Console, inspect every affected internal, closed, open, and production track. Replace rejected artifacts, discard superseded drafts as appropriate, and ensure version 13 is excluded from replacement releases.
4. Inspect the review summary and submit the corrected changes for review. Uploading a bundle alone does not constitute resubmission or approval. This task does not itself submit or publish a Play release.

No unrelated Gemini billing or age-policy issue is resolved by these UI fixes.
