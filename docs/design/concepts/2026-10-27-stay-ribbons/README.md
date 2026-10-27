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
