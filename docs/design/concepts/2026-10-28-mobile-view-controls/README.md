# Mobile records page: view controls

Date: 2026-10-28. Status: implemented on `fix/records-view-controls` (#114) with the map's stay ribbons follow-up on `fix/map-stay-ribbons` (#115); resolves #113.

[타임라인 보기](timeline-390-ko.png) · [지도 겹침 보기](map-overlay-390.png)

## Problem

[Issue #113](https://github.com/stlim0727/haptilog/issues/113) reported two conflicts on the
390px journal page:

1. The `전체 기간` (all / today / this month) dropdown sat above the view tabs while the
   timeline's day strip and the calendar already selected dates. Three controls answered
   one question, and a range picked in one of them silently emptied the others.
2. The tabs `타임라인 | 지도 | 달력` treated the map as a peer of the two feeds. Timeline and
   calendar are mutually exclusive readings of the same day; the map is an overlay either of
   them can show. The desktop layout already modelled it that way
   (`viewMode` plus an independent `showMap`); mobile did not.

## Decision

- Mobile keeps a two-way segmented control, `타임라인 | 달력`, and an independent `지도`
  on/off toggle beside it (`aria-pressed`), matching the desktop model.
- The period dropdown is removed from mobile. The day strip's `전체 날짜` and the calendar's
  month navigation and day tap are the only date controls there. The shared `date` state is
  pinned to `all` while the mobile layout is active, so a range picked on desktop cannot keep
  filtering a phone list that has no way to widen it again.
- The map renders as a panel above the strip/feed/calendar rather than replacing them, with a
  `지도 닫기` button. The `타임라인에서 보기` escape link is gone: locationless records are now
  simply in the feed below the map.
- One day scope drives the feed and the map together. Picking a day narrows both; the calendar
  scopes the map to its active day, as desktop does.
- Because the map's place list now sits directly above the feed, it renders stays through
  `JournalTimeline` like the feed does. It had used the flat pre-ribbon `JournalStayCard`, which
  was harmless as its own tab but showed the same stay two ways side by side. Fixed in #115.

## Verification

`web/e2e/mobile.spec.ts` covers the toggle's `aria-pressed` transitions, the map surviving a
timeline/calendar switch, the absence of a period dropdown, and the shared empty state under a
category filter. `web/e2e/portal.spec.ts` and `main-stay-samples.spec.ts` were updated for the
overlay model. 119 Playwright tests and 74 unit tests pass; 320/360/390/430px stay free of
horizontal overflow in both languages with 200% text.

The captures come from those runs at 390px. `timeline-390-ko.png` is the Korean timeline with
the two-way control and no period dropdown; `map-overlay-390.png` is the map switched on over
the same feed, with the day strip and records still below it; `map-stay-ribbons-390.png` is the place list with the map on, where a stay now carries the same ribbon as the feed under it.
