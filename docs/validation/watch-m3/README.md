# Watch M3 category design implementation

Implements the direction discussed in [Discussion #35](https://github.com/stlim0727/haptilog/discussions/35), including concept 03 category colors and icons. Native evidence is from a local debug APK, not an image generation mockup or a Play release.

## Implemented scope

- Separate capture home and recordings list. Active recording takes priority. Existing external launcher/Tile capture requests still return to capture; Back from detail returns to the same remembered list state.
- Wear Compose Material 3 1.5.0 theme, buttons, cards, AppScaffold/ScreenScaffold, EdgeButton, and TransformingLazyColumn for the recordings list. The capture/detail scrolling fallback uses the compatible Wear ScalingLazyColumn with M3 controls.
- Expense/receipt/peach, Travel/suitcase/blue, Workout/running/mint, Note/paper/lavender. Unknown or absent classification uses neutral microphone styling. Category labels accompany the decorative icons; category is independent of sync state.
- Bright recording titles, neutral metadata, compact locale/clock-preference formatting and nonbreaking duration units. Date and time may wrap between tokens for large fonts.
- Title/category and coral playback action before derived content. Expense amount and extracted fields get a tonal container; valid expense amounts get the category accent. Full text, export, map, retry and existing cloud-aware deletion behavior remain available.
- Settings/web share the new palette through a transitional legacy theme. Web connection gets a colored link icon. Consent/support controls are retained; their full M3 migration is deferred.
- Existing ProtoLayout recording tile gets the coral microphone and localized label. Its full-surface one-tap toggle action is retained. This does not implement the concept 02 tile's optional second navigation action or migrate ProtoLayout to its M3 DSL.

No capture service, haptic engine, source storage, upload, consent, AI, or cloud deletion policy changes.

## Automated checks

`assembleDebug lintDebug testDebugUnitTest` passed; 50 tests, zero failures/errors/skips. Lint has no errors; existing advisory/dependency warnings remain. Added coverage checks compact duration formatting/unit attachment and neutral handling of unknown categories. Existing external/internal return, playback failure, source preservation, deletion and sync tests pass.

## Native evidence

Wear OS API 34 x86_64 round emulator, native 454px at 320dpi (227dp); 384px override (192dp). APK packages x86_64 libraries. Screenshots settle for at least two seconds and are paired with UI hierarchy XML. `final-*` captures are from the final explicit-clock-guard APK; the matrix/detail captures verify the same layouts before that overlay-only guard. Intermediate flow captures superseded by the matrix were removed.

- `home-*`, `recording-*`, `list-*`, `detail-*`, `settings-*`: size/font matrix, Korean 192/227dp × 1×/2×. English 192dp/2× home/list/detail is a localization stress check; Korean recording summaries remain Korean user content in that locale.
- Category-specific detail and list captures show synthetic derived metadata over new emulator recordings. Ordinary unclassified captures also remain visible.
- Playback start/stop, full-text expansion, deletion confirmation/cancellation, list Back, Settings Back, external Home/re-entry and offline process restart are exercised. See `behavior.txt` for source hash checks and the exact completed actions.
- Cloud consent was not enabled, pairing codes were not created, and no recordings were uploaded. Source audio and capture metadata are never modified to fake durations or categories; only derived enrichment sidecars use synthetic fixtures.

The final detail header is split into independent category/title/metadata list items so a tall first item cannot center itself under the clock at 192dp/2×. Metadata uses a FlowRow of date/time/duration tokens to avoid splitting Korean day periods or units. Scrolling screens explicitly hide TimeText when scrolling or away from the top.

## Limits

This is a phased M3 adoption, not a complete replacement of legacy settings/web/ProtoLayout components. The generated design's exact geometry, textures and mock data are not an implementation specification. Large fonts intentionally scroll rather than squeezing all controls into one viewport. List titles may ellipsize at two lines; full summary remains available in detail.

TalkBack spoken navigation, physical rotary feel, Galaxy Watch haptics, microphone interference and battery acceptance still require physical hardware/manual validation. XML labels and screenshots are supporting evidence, not a TalkBack usability trial. Tile rendering in the carousel and real device launcher/Tile interaction need hardware follow-up; its existing launch action code is preserved. No Play deployment or merge is performed by this validation.

## Reproduction

Use a disposable debug Wear emulator with cloud disabled. `verify_flow.py` creates new captures and writes synthetic derived enrichment sidecars, `fixture-ids.json` and `source-hashes.txt`. `verify_matrix.py`, `verify_headers.py`, and `verify_clock.py` use those fixture identifiers; run the flow first on another emulator. The checked-in identifiers/hashes are evidence from this run, not portable source files. `native_helpers.py` waits for Activity launch and UI idle, then settles for two seconds before screenshots. No script should be run against personal watch data.

The scripts intentionally alter locale, font size and display override. Restore display size, font scale, locale, network and stay-awake after use, then stop the owned emulator. A cold-boot system sensor-service crash and an emulator shutdown interrupted earlier collection attempts; final accepted captures/checks were collected after restarting the emulator. These infrastructure interruptions are not reported as app behavior passes.
