# Location stays foundation

These modules are mounted for connected portal sessions through `LocationLauncher.tsx` (see `main.tsx`), but the feature is not deployed: the `location_stays` migration is local-only. `fixtures.ts` contains synthetic data only. Sample/demo mode never enables the workspace. Repository calls hit the `location_stays` RPC with the portal owner; the server authorizes the caller independently.

- `types.ts` follows `docs/architecture/location-stays-sync.md` wire stay fields.
- `domain.ts` provides observation freshness, calendar/DST slices, conservative recording association candidates, place validation and overlap detection.
- `StayTimeline.tsx` renders observation status and accepts existing recording UI through a callback. The caller must refresh `now`, scope data by authorized owner and supply only the recording associations for each displayed date slice; a cross-midnight stay retains its ID.
- `PlaceEditor.tsx` and `PlaceMap.tsx` provide standalone place creation/editing with an injected save callback. Remount the editor with a new key when switching drafts. `expectedRevision` must be the server's **place collection revision**, not the individual place revision. Transient refresh failures retain the draft; authorization loss clears it. A reported conflict preserves the draft until the user loads the latest value, reviews it and explicitly reapplies against the reviewed revision. Overlap acknowledgement permits saving the area; it does not assign any past recordings to that place.
- `recommendations.ts` uses provisional conservative 100m clustering, accuracy <=30m and 30-minute fragment count suppression. It never fills gaps. The rules require field validation, and suppression may intentionally miss nearby visits. `dismissals.ts` stores owner-scoped browser preferences for at most seven days and no later than their source stays' earliest expiry. Access prunes expired and legacy entries; stay deletion, observed revocation and sign-out clear the relevant preferences.

The portal test script includes the location subdirectory. Run pure tests and the production build with:

```sh
npm test --prefix web
npm run build --prefix web
```

`web/e2e/stays-followup.spec.ts` uses mocked RPCs to cover editing recovery, authorization loss, hidden-coordinate cleanup and theme/narrow-screen rendering. This is not live backend or complete accessibility evidence. Still required before release: explicit historical association persistence, broader browser/accessibility verification and real device/backend synchronization evidence. Watch-side consent reconciliation adopts a web re-enable's bumped consent token and disables locally on server-side revocation (see `LocationSyncClient.ensureConsentCurrent`). Track remaining product and release work in [the follow-up checklist](../../../docs/design/location-stays-followup.md).
