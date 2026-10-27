# Name a place inline

Place naming now uses the existing journal input and primary/secondary button
styles directly inside the ribbon or stay inspector. It contains one name field
and Save/Cancel, without opening settings, a map or coordinate/radius controls.
A new place uses the observed representative position and the existing 200m default;
renaming reuses the saved place ID, coordinates and radius. Source stays are unchanged.

Checks cover desktop/mobile entry, autofocus, cancellation and focus return,
name-only saves, geometry preservation, network failure and draft retention,
revision conflict with explicit review, and an acknowledged save followed by a
failed refresh. Existing shared-journal regression checks also pass.
The screenshots show synthetic fixture data.
