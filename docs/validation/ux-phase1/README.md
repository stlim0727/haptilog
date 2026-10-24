# Watch UX Phase 1 validation

Implementation: [A #36](https://github.com/stlim0727/haptilog/pull/36) → [B #37](https://github.com/stlim0727/haptilog/pull/37) → [C #38](https://github.com/stlim0727/haptilog/pull/38). Scope: [Discussion #35](https://github.com/stlim0727/haptilog/discussions/35#discussioncomment-19156201).

## Automated checks

Combined implementation (including B review fix 7e8a3d2): `assembleDebug lintDebug testDebugUnitTest` passed, 42 tests, zero failures/errors/skips. Eleven added tests cover external/internal return policy, failed external activity launch, process recreation policy, derived presentation without source mutation, cloud-off state, local deletion failures including audio-removed/metadata-retained, and missing playback source. Existing recording/location/haptic tests continue to pass.

## Native evidence

Wear OS API 34 x86_64 round emulator, 320dpi. Native 454px = 227dp; 384px override = 192dp. Font scales 1.0 and 2.0 (stress setting; not a claim about every physical watch maximum). Screenshots settle at least two seconds; XML accompanies final and matrix screenshots. Synthetic summary/transcript is derived test data over an emulator-generated silent recording. No cloud consent, real audio upload, or pairing-code issuance was used.

- [A captures](a/): capture hierarchy/clock and active state.
- [Korean default-font flow](final/): home → list → Settings → Web → Back → detail → full text → delete confirmation → cancel → Back → external re-entry.
- [Size/font matrix](matrix/): English home, list, detail top, Settings at both sizes and font scales.
- [Action evidence](actions/): active capture at both sizes and font scales; worst-case large-font playback/full text/delete controls.
- [Source persistence evidence](final/behavior.txt): audio and immutable capture metadata SHA-256 stayed identical after delete cancellation and offline force-stop/restart.

For the same summary card, UI hierarchy bounds are exactly `[57,265][370,310]` before opening Settings, after Settings Back, and after detail Back. External Home/launch returns to Record. Detail first viewport exposes Play at 192dp and 227dp default font. Full transcript expansion changes the visible control to Hide full text. Delete confirmation explains watch-only scope and retained cloud copies, with Cancel before Delete.

## UX review and limits

UX director reviewed Korean 227dp default-font native evidence: no blocking visual issue; playback is available immediately, expansion/deletion controls are clear, settings/build ordering and code creation meet Phase 1 hierarchy. The full size/font screenshot matrix and final action captures also received visual GO with no new blockers. At 192dp/2×, playback started/stopped, the long transcript was traversed to Export/Delete, and both Cancel/Delete confirmation controls were reachable. Cancellation again preserved original audio/metadata SHA-256 values; see [action behavior](actions/behavior.txt). Minor follow-up: compact date/duration formatting to avoid duration-unit line separation in Korean list metadata and excessive date wrapping in 192dp/2× detail.

Source semantics explicitly identify Start/Stop recording and recording state; full text and sync details expose expanded/collapsed state. XML and screenshots are supporting evidence, not a TalkBack usability trial. Physical Galaxy Watch haptic feel, microphone interference, battery/timeout field behavior, rotary hardware feel, actual maximum-font setting and TalkBack remain hardware/manual acceptance work. Existing haptic, capture service, storage, cloud and consent contracts were not redesigned. Existing long English consent/support disclosures remain a separate localization follow-up.

These PRs implement Phase 1; this evidence does not represent Play approval or a published release.

## Reproduction

The Python scripts here use adb on the dedicated emulator, change display/font/locale and create silent captures or derived synthetic text. Use disposable emulator app data. `native-flow.py` expects an existing emulator-generated recording. `size-font-matrix.py` and `action-checks.py` expect the synthetic summary fixture from that flow. Network is disabled for native-flow checks. Restore display/font/locale/network/stay-awake and stop the owned emulator after running. These scripts are evidence collection helpers rather than CI assertions of TalkBack/hardware behavior.

PR A main-target CI passed. B/C are stacked and normal CI only targets main; combined local Android checks passed. Required main-target checks must run again as the stack is retargeted for merge.
