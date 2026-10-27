# Stay ribbon grouping and place colors

Synthetic fixture: three stays at the same saved place, separated by exactly
three and two minutes, plus a different place. The combined ribbon reports
30 observed minutes across a 35-minute range; the gaps are not counted.
Expanding it exposes all three source stays. Source detail and deletion retain
their original IDs. Another place uses another hue; hues survive reloads.

Validation includes boundary gaps, overlap/ambiguity/unknown-place separation,
hidden competing stays, source immutability, gap-time voice exclusion and
mobile/desktop layout and navigation. See `ribbonGroups.test.mjs` and
`e2e/ribbon-groups.spec.ts`.
