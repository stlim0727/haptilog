# Main journal vertical stay ribbons — design proposal

2026-10-27. Based on the user's annotated main-calendar recording list. This
supersedes the horizontal-axis interpretation for this requested main-list mockup.
It is an interactive design artifact, not a completed ribbon implementation.

- Voice recordings retain their ordinary main-list cards in chronological order.
- A stay appears as a separate slim vertical ribbon at the left of its matched
  voice entries. The stay is not another rectangular list card.
- A stay with no voice entries occupies a half-row slot: 64px compared with the
  128px voice-card reference. It still shows place, start/last observation, and
  confirmed duration and remains selectable for stay details.
- Ribbon height describes list grouping/density, not elapsed or confirmed time.
  Its endpoint labels provide actual observation times. Confirmed duration is
  independently labelled; unknown gap positions are never invented.
- Time overlap alone does not prove association. Spatial disagreement or multiple
  competing stays must not force a voice entry into a stay. Such cases need a
  separate lane/uncertainty treatment during implementation.
- Cross-midnight ribbons retain one source identity and show continuation at day
  boundaries. Expiry/deletion, source association and audio actions retain their
  existing contracts.

Open `index.html` to interact with ribbon details. `desktop.png` compares the two
cases; `mobile.png` shows them at 390px. Rendering checked 128px/64px sizing,
mobile horizontal containment and keyboard-accessible empty-stay disclosure.
All recordings and locations in this design are synthetic.

## Unnamed stay → known place (beacon)

An unnamed ribbon exposes **＋ 비콘으로 저장** directly beside its place label,
including the 64px empty-stay slot. Known ribbons use their current place name
and offer editing instead of creating a duplicate. The prototype's unnamed
example is case B; the same entry applies to case A when it is unnamed.

The save sheet starts at the stay's representative observation position, asks for
a 1–40-character name and a 150–2,000m radius (200m preview default), and distinguishes
GPS accuracy from the user's chosen place radius. Nearby existing beacons can be
reused. This is the existing SavedPlace concept with a user-facing beacon label,
not a Bluetooth device or new background behavior. The existing 20-place limit,
owner authorization and conflict/draft-preservation rules remain implementation
requirements.

Save updates the prototype's displayed ribbon name and changes its entry to
**비콘 수정**. Original coordinates, observation times and confirmed duration are
not changed; naming is qualified as the current beacon setting. Cancel returns to
the ribbon. The HTML mockup makes no network writes and explicitly labels the
save as prototype-only.

`beacon-desktop.png` and `beacon-mobile.png` show the save sheet;
`beacon-saved-mobile.png` shows the renamed half-row ribbon. Pointer entry,
name/save/edit/cancel, retained 64px height and mobile horizontal containment
were verified in the project Chrome session. The map is a schematic preview.
