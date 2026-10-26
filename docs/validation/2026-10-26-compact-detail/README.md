# Compact recording detail

The detail view prioritizes audio and the transcript. Edit sits beside the
transcript heading. Original AI text, edit history, generated JSON, and location
measurements sit behind one Recording details disclosure. Download and trash
live in Recording options; Escape closes the disclosure and restores focus.
Location measurements are rounded only for display.

The screenshots use mocked NOTE recording data, with audio not yet loaded.

- [Korean, 390 px](mobile-ko.png)
- [Korean, 320 px and 200% text](mobile-ko-text200.png)
- [English, 320 px and 200% text](mobile-en-text200.png)

Validation: production build, 25 unit tests, and 30 mobile/portal Playwright
scenarios, including download before playback, keyboard options, preserved
transcript edits/history, trash/restore, and narrow enlarged text without
horizontal overflow. Backend requests are mocked; no production data is changed.

Review follow-up: keep the options trigger right-aligned when long headings
wrap. The new regression reproduced a menu left edge of -174 px before the
fix, then passed at 320/390 px with normal and 200% heading text. It checks
both horizontal bounds and full visibility after scrolling for the popover
and each action. Production build and all 14 mobile scenarios passed after
the fix (13 existing scenarios plus the new regression).
