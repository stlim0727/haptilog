# Place settings focused on saved names

The initial panel now shows My places, saved names, edit/delete actions and manual
map addition. Sync controls, data deletion and nonempty suggestions are collapsed.
Long status/disclosure paragraphs no longer appear before the user's places.

Editing an existing place begins with the name field. Map/coordinates/radius mount
only when Adjust location is expanded; name-only saves preserve geometry. Manual
map addition opens location controls. Inputs, buttons, borders and light/dark colors
reuse the journal theme. The fixed-width panel is capped to the viewport.

Validation: web build and 72 unit tests passed; 19 distinct settings, locale,
authorization, conflict, refresh, recommendation and combined-sync E2E cases
passed across runs. The four desktop/mobile theme cases also passed on final
screenshot capture. Screenshots contain synthetic data.
