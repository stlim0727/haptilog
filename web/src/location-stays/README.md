# Location stays foundation

These modules are mounted for connected portal sessions through `LocationLauncher.tsx` (see `main.tsx`), but the feature is not deployed: the `location_stays` migration is local-only. `fixtures.ts` contains synthetic data only. Sample/demo mode never enables the workspace. Repository calls hit the `location_stays` RPC with the portal owner; the server authorizes the caller independently.

- `types.ts` follows `docs/architecture/location-stays-sync.md` wire stay fields.
- `domain.ts` provides observation freshness, calendar/DST slices, conservative recording association candidates, place validation and overlap detection.
- `StayTimeline.tsx` renders observation status and accepts existing recording UI through a callback. The caller must refresh `now`, scope data by authorized owner and supply only the recording associations for each displayed date slice; a cross-midnight stay retains its ID.
- `PlaceEditor.tsx` and `PlaceMap.tsx` provide standalone place creation/editing with an injected save callback. Remount the editor with a new key when switching drafts. `expectedRevision` must be the server's **place collection revision**, not the individual place revision. A reported conflict preserves the draft for explicit review/reload. Overlap acknowledgement permits saving the area; it does not assign any past recordings to that place.
- `recommendations.ts` uses provisional conservative 100m clustering, accuracy <=30m and 30-minute fragment count suppression. It never fills gaps. The rules require field validation, and suppression may intentionally miss nearby visits. Hidden areas are owner-scoped inputs, not persisted by this module.

Run the new pure tests explicitly (the existing npm test glob does not include subdirectories):

```sh
node --experimental-strip-types --test web/src/location-stays/domain.test.mjs
npm run build --prefix web
```

Still required before release: explicit historical association persistence, browser interaction/accessibility verification and real device/backend synchronization evidence. Watch-side consent reconciliation now adopts a web re-enable's bumped consent token and disables locally on server-side revocation (see `LocationSyncClient.ensureConsentCurrent`). The foundation does not pretend the remaining items are complete.
