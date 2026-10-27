# Compact stay ribbons

Collapsed stays now use a 44px minimum row and 6px list gaps. The label contains
only the place name and a short 24-hour range with observed minutes. Mobile day
headings supply the date; mixed-date desktop feeds retain a short M/D prefix.
Cross-midnight ranges retain both endpoint dates.

A chevron opens source stays on demand. The separate group-count line and gap
explanation are removed from the feed. Known-place rename actions use a pencil
icon with an accessible name. Original observations and duration calculations are
unchanged, and the inline name form remains available.

Validation: build passed; 11 focused desktop/mobile E2E cases passed, followed by
two final date-context/grouping checks. Captures target the ribbon region to
avoid full-page capture viewport changes affecting the tested state.
Screenshots contain synthetic data.
