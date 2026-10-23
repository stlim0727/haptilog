# Watch UX review — 2026-10-23

Scope: merged watch UI at `a01bc196c08becbf30c8939814e43dde2bbaa1e5`, reviewed with the UX director agent. Source was inspected from `origin/main`, because the shared working checkout contains older and unrelated edits. Evidence: `docs/validation/2026-10-23-wear-policy/`, especially its `current-main/` screenshots. This is a design review; no application changes were made.

## Diagnosis

The app has a clear tactile identity but an inconsistent visual hierarchy. The dark circular record control, default light-blue navigation chips, and custom gray/red detail actions feel like separate systems. Making controls grow for accessibility fixed clipping without resolving their relative emphasis.

| Priority | Evidence | Recommended change |
| --- | --- | --- |
| High | Settings appears before recordings and uses primary blue; Record is a dark disc with a small red dot. | Make Record the clearest action. Give Settings and other utility navigation neutral secondary styling while keeping labeled entry points discoverable. |
| High | Detail order is date/category, summary, transcript, structured data, map, sync diagnostics, retry, then playback. | Put playback immediately after identity/duration. Keep summary next; expose transcript and technical sync details on demand. Retain visible error/retry state when action is needed. |
| High | Current-main enlarged-font screenshots show the clock covering scrolling text and action labels. Main and details render static TimeText. | Coordinate time with scrolling so it moves away instead of overlaying content. Preserve the scroll indicator. |
| High | Delete directly invokes local file deletion and is a large peer of export/playback. | Give deletion lower visual emphasis and an explicit confirmation that describes deletion from this watch, including the effect on any cloud copy. |
| Medium | Korean recent/category/detail labels coexist with English Record, Settings, pairing and support copy. | Use one locale per UI, shared string resources and consistent action wording. Show an explicit Stop action while recording. |
| Medium | Settings foregrounds version/build information and mixes connection, sync, updates, reporting and lengthy explanations in one feed. | Order common tasks first; group connection/sync, support/privacy, and About. Put build details in About. Keep consent disclosures available before opt-in. |
| Medium | Nested percentage widths and fixed padding narrow detail text; font sizes, shapes and button colors vary by screen. | Define a shared watch typography, spacing, surface and action hierarchy. Check readable content width on the smallest round display. |

Default-font screenshots establish the color and hierarchy problems. The 2×-font captures establish stress-case overlap and wrapping behavior; their enlarged appearance is not evidence that default-size controls should be made tiny. Partially visible items at a scrolling viewport edge are expected; the clock painting over readable content is a separate defect.

## Direction agreed with the designer

A calm capture surface: black background, legible white text, one consistent recording accent, and quiet neutral secondary controls. Preserve the circular control and existing start/heartbeat/stop haptic behavior. Show a clear Record/Stop state and concise saved/local/cloud feedback. Avoid another collection of equally prominent pill buttons.

First implementation can retain the current vertical home and its accessible Settings entry. Demote Settings visually; do not bury it below unbounded history. Reorder details around playback and readable content, fix the clock behavior, and unify styling/localization. A broad component-library migration is not necessary to prove that design direction.

For a subsequent prototype, compare that improved home with a focused Capture screen and a separate Recordings list. Use labeled Recordings/Settings navigation reachable with a short scroll, not an unexplained gear or hidden gesture. A 192dp round screen cannot be assumed to fit a large record disc and several full-size navigation controls simultaneously. Test the layout before committing to navigation changes. A dedicated list should retain its place when returning from details; launch/resume capture behavior needs to respect the existing quick-record requirement.

## Acceptance criteria for the prototype

- At normal font size, Record is the first and strongest action; Settings does not visually outrank it.
- Recording state makes stopping obvious; haptic and local-first recording behavior remain unchanged.
- Playback is reachable near the top of details without scrolling through a full transcript or diagnostics.
- Time never covers content or controls while scrolling; scroll position remains visible during interaction.
- Buttons retain adequate touch targets and grow with system fonts; no font-scale caps or shrinking text to force a fit.
- Destructive deletion requires an explicit choice and accurately states its local/cloud scope.
- English and Korean are tested as complete locales, rather than mixed hardcoded labels.
- Inspect idle, recording, saved, long-history, long-transcript, offline/error, pairing, and consent states on 192dp and larger round displays, at normal and enlarged fonts.

## Reference guidance

- [Wear app design principles](https://developer.android.com/design/ui/wear/guides/m2-5/surfaces/apps-principles): focused tasks, shallow navigation, labeled inline actions, primary-action emphasis and scrolling.
- [Wear button hierarchy](https://developer.android.com/design/ui/wear/guides/m2-5/components/buttons): different emphasis for primary and secondary actions.

These recommendations follow the inspected UI and product purpose; they are not a new Google policy ruling or a physical-device usability study.
