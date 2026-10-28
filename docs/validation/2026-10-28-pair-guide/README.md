# Pairing guide copy and step illustration — 2026-10-28

## Reported behavior and changes

The web portal's pairing instructions named screens that no longer exist
on the watch: "open Web access and tap Create code". The actual flow is
Settings → "Review on the web" → "Create connection code"
(`web_access_title`, `create_code_action` in the watch strings). Updated
`connect_desc` in EN and KO to match the device.

Added an inline SVG three-step watch mockup above the instructions so
the guide is visual, not text-only. Colors come from the page theme
variables, so light and dark mode both work; container queries scale the
frames down on narrow viewports.

## Validation

- `npm run build` (tsc + vite) passed.
- 76 web unit tests passed; full Playwright e2e suite (119 tests) passed.
- Screenshots rendered from the pairing-page Playwright fixture at
  1280px (dark, light) and 360px. Synthetic fixture only; no user data.
