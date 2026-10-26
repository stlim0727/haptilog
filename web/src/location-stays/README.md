# Location stays on the web

A stay is a journal item without audio: `main.tsx` converts every visible stay into a `TimelineItem`
and renders it in the same List, Calendar, Time Slider, Map and Inspector as voice recordings, with
the audio and transcript halves hidden. Sample/demo mode never loads stays. Repository calls hit the
`location_stays` RPC with the portal owner; the server authorizes the caller independently.

- `journal.ts` turns a stay into a journal item: the name comes from the single saved area that
  contains its observed point, so an ambiguous or unnamed area stays honestly "Unnamed stay".
- `useLocationStays.ts` owns one owner's snapshot (poll, visibility refresh, mutation generation) and
  the browser-local hidden-area preferences. It exposes no consent control: the watch's cloud sync
  switch is the only authorization, and the server mirror simply reports it.
- `PlacesPanel.tsx` is the only place editor for watch and web. It edits saved areas, the shared stay
  threshold and frequent-area suggestions, and can delete server stays.
- `types.ts` follows `docs/architecture/location-stays-sync.md` wire stay fields.
- `domain.ts` provides observation freshness, calendar/DST slices, conservative recording association
  candidates, place validation and overlap detection.
- `PlaceEditor.tsx` and `PlaceMap.tsx` provide standalone place creation/editing with an injected save
  callback. Remount the editor with a new key when switching drafts. `expectedRevision` must be the
  server's **place collection revision**, not the individual place revision. Transient refresh failures
  retain the draft; authorization loss clears it. A reported conflict preserves the draft until the
  user loads the latest value, reviews it and explicitly reapplies against the reviewed revision.
  Overlap acknowledgement permits saving the area; it does not assign any past recordings to that place.
- `recommendations.ts` uses provisional conservative 100m clustering, accuracy <=30m and 30-minute
  fragment count suppression. It never fills gaps. The rules require field validation, and suppression
  may intentionally miss nearby visits. `dismissals.ts` stores owner-scoped browser preferences for at
  most seven days and no later than their source stays' earliest expiry. Access prunes expired and
  legacy entries; stay deletion, cloud sync turning off and sign-out clear the relevant preferences.

The portal test script includes the location subdirectory. Run pure tests and the production build with:

```sh
npm test --prefix web
npm run build --prefix web
```

`web/e2e/stays-followup.spec.ts` uses mocked RPCs to cover the stay appearing as a record (list,
detail without audio, `?stay=` deep link, calendar, map, phone layout), editing recovery, authorization
loss, hidden-coordinate cleanup and theme/narrow-screen rendering. This is not live backend or complete
accessibility evidence. Still required before release: explicit historical association persistence,
broader browser/accessibility verification and real device/backend synchronization evidence. Watch-side
consent reconciliation adopts a re-enable's bumped consent token and disables locally on server-side
revocation (see `LocationSyncClient.ensureConsentCurrent`). Track remaining product and release work in
[the follow-up checklist](../../../docs/design/location-stays-followup.md).
