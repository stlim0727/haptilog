# Pairing confirmation, analysis repair, and recording map — 2026-10-17

## Reported behavior and changes

The watch previously counted down a pairing code but never checked successful browser redemption. While a code is issued, it now polls its own active browser grants every five seconds only while STARTED. A connection created during that code's server-time issue/expiry window clears the code and displays Browser connected. Existing older grants never clear a newly issued code. Countdown updates separately from network polling; polling includes a final expiry-boundary check, and keep-awake remains capped at one minute per foreground entry.

Two uploaded recordings had generic ANALYSIS_FAILED states. An operator diagnostic using no user recordings found the configured gemini-2.5-flash generation route returned 404 despite remaining in the model listing; the same key succeeded with gemini-flash-latest. The backend now retries that specific model-not-found case once through the Flash alias, using the same persisted original audio and shared timeout. It does not fall back on auth, quota, or transient provider failures. Safe model/configuration/quota/unavailable/invalid-response categories are stored and returned; raw provider bodies and credentials are never exposed. Existing failed entries are not silently bulk-reprocessed; the user can Retry analysis.

The portal offers an explicit Show map action. Leaflet and its tiles are loaded only when requested. Valid GPS coordinates become pins; exact-coordinate groups list each recording. Pin selection and the existing inspector share one selection, and opening a popup recording scrolls to its details. Filters apply to both map and list. Missing/invalid locations are not fabricated or removed from the list. Tile failures explain the limitation, and failure to load the optional map bundle leaves the list/audio inspector usable. OpenStreetMap attribution remains visible; there is no Google Maps key requirement. Tile requests reveal the displayed viewport to OpenStreetMap, but no audio/transcript is sent to it.

## Validation

- Watch assembleDebug, lintDebug and 19 unit tests passed, including new-versus-old grant timestamps and expiry boundaries.
- 26 Edge Function authorization/validation tests passed, including one-time 404 fallback and no fallback on quota/configuration/custom-model errors; Deno typecheck passed.
- 15 web unit/config/credential-boundary tests and production build passed.
- Eight browser tests cover pairing/reload, corrections/CSV, original audio/retry, revocation, desktop/mobile sizing, grouped-pin voice selection, unlocated recordings, optional-map download failure, and clearing a prior provider error after a successful retry. A separate live-tile run verified actual OpenStreetMap tile loading with synthetic Seoul coordinates; map-mobile.png shows sample records, not user records.
- Against the live backend, a fresh synthetic browser redeemed a code issued by the debug Wear OS emulator. The watch removed the numeric code and showed Browser connected (pairing-confirmed.png). The test grant was revoked, session logged out, and synthetic browser account deleted.
- Generated a 1.5-second MP4 tone without microphone/user audio, uploaded through the normal authenticated API as a new synthetic owner, and received a validated saved enrichment from the repaired live function. The synthetic recording, storage object, enrichment and account were cleaned up.
- The temporary token-protected provider diagnostic was restored out of the serving function immediately; no operator diagnostic route remains.

Screenshots are from diagnostic builds and synthetic fixture data. They do not establish the installed build number on a physical watch or claim the user's two older recordings were already reprocessed.

## Production map policy check

The deployed image CSP initially permitted only same-origin/data images, which blocked the external map tiles even though development-server tests passed. The policy now permits only the explicit tile.openstreetmap.org image origin. Tile images override referrer policy to origin-only for the tile service, while the rest of the page retains no-referrer. A separate acceptance server applies the built _headers file to the compiled portal; its browser test confirms a tile becomes visible and receives only the page origin as Referer. CI runs this production-header test in addition to the eight development/browser flows.
