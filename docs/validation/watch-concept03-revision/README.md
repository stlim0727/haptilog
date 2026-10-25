# Concept 03 fidelity correction

Follow-up to the first implementation in PR #43. The approved reference is concept 03, posted in [Discussion #35](https://github.com/stlim0727/haptilog/discussions/35#discussioncomment-19163290).

This revision changes the geometry as well as the palette:

- Capture home: dominant coral circular microphone; horizontal icon/label navigation chips below. Default 227dp hero is 100dp; 192dp uses 74dp to retain reachable navigation and 48dp touch targets.
- List: category icon circles next to title, category and short date/duration; explicit compact line heights; no edge opacity fade. Enlarged fonts move metadata below the icon/title row so duration stays intact.
- Travel detail: centered header, short metadata, circular play, summary, full-text action.
- Expense detail: category/title, prominent amount card, small circular play with duration, full-text action. Won suffix appears only for explicit KRW in Korean; missing currency is never inferred.
- Full original timestamp and all extracted fields remain available further below. Recording source, haptic, GPS, storage, sync and deletion policy are unchanged.

## Evidence provenance

`fixture-*.png` and paired XML are **native Android renders of production composables with deterministic visual fixtures**, using the debug-only `DesignPreviewActivity`. They are not generated mockups. Their dates, durations, classification and uploaded state are synthetic; silent cache audio only enables the control appearance. Preview callbacks never record, play audio, sync, export or delete. The activity is absent from the release manifest. These screenshots establish layout only. The final change shortened the English home action from Recordings to Records; English home captures were repeated after that label refinement. Other layout/behavior evidence uses the same Kotlin layout before this label-only change.

`actual-*.png` and `behavior.txt` separately exercise `MainActivity` and real emulator capture/playback. Only the derived enrichment sidecar is synthetic; source audio and capture metadata are preserved. No cloud consent/upload is enabled.

The model currently uses summary as the title. Consequently the travel summary repeats the title rather than inventing a separate short-title field to mimic the reference. The palette uses solid native surfaces instead of the reference image's texture. At enlarged font sizes content scrolls; list titles retain the existing two-line ellipsis and full summary is available in detail.

## Viewport expectations

| Display | Accepted native behavior |
| --- | --- |
| 227dp / 1× Korean | Two category cards; travel and expense primary controls/full-text label visible in the initial viewport. |
| 192dp / 1× Korean | Home navigation remains visible; list metadata can wrap, and detail/full-text content requires scrolling. |
| 192/227dp / 2× Korean | Header stays below the clock; content scrolls. At 192dp the expense currency suffix can wrap to its own line, remaining part of the same accessible amount text. |
| 192dp / 2× English | Interface labels localize; fixture summaries remain Korean user content. Navigation and full text remain scrollable. |

## Checks and reproduction

Wear OS API 34, x86_64, round 454px/320dpi (227dp), 384px override (192dp). Capture helpers wait for UI idle and two seconds before a screenshot, then save a matching accessibility hierarchy. Run from repository root on a disposable debug emulator, with cloud disabled:

```sh
python3 docs/validation/watch-concept03-revision/capture_fixtures.py
python3 docs/validation/watch-concept03-revision/verify_matrix.py
python3 docs/validation/watch-concept03-revision/verify_behavior.py
# Optional focused repeat after changing the English home action:
python3 docs/validation/watch-concept03-revision/verify_english_home.py
```

`assembleDebug lintDebug testDebugUnitTest processReleaseMainManifest` passed: 51 tests, zero failures/errors/skips. Release merged manifest excludes the debug preview activity. Physical watch haptic/battery/microphone checks and spoken TalkBack acceptance remain manual hardware work. No Play deployment or merge.
