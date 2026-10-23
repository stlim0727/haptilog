# Watch UX comparison artifacts

Prepared for the owner-requested design discussion on 2026-10-23. These are review materials and proposed directions, not implemented application screens. Application source reviewed: `a01bc196c08becbf30c8939814e43dde2bbaa1e5`.

- `watch-ux-comparison.png` / `.html`: initial hierarchy and detail-flow comparison.
- `samsung-health-comparison.png` / `.html`: official Samsung Health watch example, current HaptiLog, and illustrative proposals.
- `samsung-voice-recorder-comparison.png` / `.html`: Samsung-published Voice Recorder watch screenshots compared with actual HaptiLog captures.
- `non-recording-review/01-recordings.png`: list and details.
- `non-recording-review/02-settings.png`: settings entry and settings landing.
- `non-recording-review/03-connection-consent.png`: browser connection and cloud consent.
- `non-recording-review/review.html`: navigable combined document.
- `non-recording-review/current/`: original emulator screenshots and UI hierarchies, using synthetic recording content.

## Sources and scope

Samsung reference images remain Samsung's published material, reproduced in these attributed comparison boards for visual critique. They are not HaptiLog product assets or claims of a Samsung endorsement.

- [Samsung Voice Recorder — official publisher listing](https://play.google.com/store/apps/details?id=com.samsung.android.wear.voicerecorder&hl=en), published screenshots 1–4. The available seven screenshots do not establish detailed recording-list or settings layouts; tile-like examples were not treated as app lists. Versions/models can differ. No physical side-by-side test was performed.
- [Samsung Health workout guide](https://www.samsung.com/us/support/answer/ANS10006858/), official watch exercise-selection image.
- [One UI 9 Watch Design Story](https://design.samsung.com/global/contents/view/one-ui-9-watch), official illustrative design references; actual products can differ.
- [Wear app principles](https://developer.android.com/design/ui/wear/guides/m2-5/surfaces/apps-principles).
- [Wear button hierarchy](https://developer.android.com/design/ui/wear/guides/m2-5/components/buttons).

HaptiLog captures use default fonts at 227dp unless separately identified as earlier 192dp/2× evidence. Some entries at the round viewport edge are naturally partially visible; this was distinguished from text/clock overlay defects. The Korean sample titles and timestamps in proposals are illustrative data.

All prototypes still require native validation at 192dp and larger round displays, enlarged system fonts, full touch targets, Korean/English locales, and physical-watch haptic/battery checks. Cloud consent and data-flow disclosures must not be removed when reorganizing content.
