import { expect, type Page } from "@playwright/test";
import { fixture } from "./portal-fixture";
export const stayOwner = "11111111-1111-4111-8111-111111111111";
export const hiddenKey = `haptilog-location-hidden:${stayOwner}`;
export async function staysFixture(page: Page) {
  const portal = await fixture(page);
  await page.clock.install({ time: new Date("2026-10-26T06:00:00Z") });
  const state = {
    failSnapshot: false, forbidden: false, conflictNext: false, snapshotCalls: 0, puts: [] as any[],
    data: {
      protocol_version: 1,
      state: { consent_enabled: true, consent_revision: 2, sync_epoch: 3, upload_cutoff: "2026-10-20T00:00:00Z", places_revision: 4, applied_places_revision: 3, threshold_minutes: 10 },
      places: [{ id: "22222222-2222-4222-8222-222222222222", revision: 4, name: "Original cafe", latitude: 37.5, longitude: 127, radius_meters: 200 }],
      stays: [{ id: "44444444-4444-4444-8444-444444444444", session_id: "55555555-5555-4555-8555-555555555555", source_revision: 1,
        started_at: "2026-10-26T05:00:00Z", qualified_at: "2026-10-26T05:10:00Z", last_observed_at: "2026-10-26T05:59:00Z", end_confirmed_at: null,
        observed_duration_millis: 59 * 60_000, status: "active", end_reason: null, clock_discontinuity: false,
        representative_latitude: 37.5, representative_longitude: 127, accuracy_meters: 15, observation_radius_meters: 100, threshold_minutes: 10 }],
      deleted_ids: [] as string[],
    },
  };
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/rest/v1/rpc/location_stays", async route => {
    const { p_owner, p_action, p_payload } = route.request().postDataJSON();
    expect(p_owner).toBe(stayOwner);
    const respond = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (state.forbidden) return respond({ error: "FORBIDDEN" });
    if (p_action === "snapshot") {
      state.snapshotCalls++;
      if (state.failSnapshot) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "NETWORK" }) });
      return respond(state.data);
    }
    if (p_action === "put_place") {
      state.puts.push(p_payload);
      if (state.conflictNext) {
        state.conflictNext = false; state.data.state.places_revision++;
        state.data.places[0].name = "Updated on another device";
        return respond({ error: "REVISION_CONFLICT" });
      }
      if (p_payload.expected_revision !== state.data.state.places_revision) return respond({ error: "REVISION_CONFLICT" });
      state.data.state.places_revision++;
      state.data.places[0] = { ...state.data.places[0], ...p_payload, revision: state.data.state.places_revision };
      return respond({ state: state.data.state });
    }
    if (p_action === "consent") { state.data.state.consent_enabled = p_payload.enabled; state.data.state.consent_revision++; return respond({ state: state.data.state }); }
    if (p_action === "delete_stays") {
      state.data.deleted_ids.push(...state.data.stays.map(stay => stay.id)); state.data.stays = []; state.data.state.sync_epoch++;
      return respond({ state: state.data.state });
    }
    throw new Error(`Unexpected location action: ${p_action}`);
  });
  return { state, portal };
}
export async function openStays(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Stays and my places", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Stays and my places" });
  await expect(dialog.getByText("Original cafe", { exact: false }).first()).toBeVisible();
  return dialog;
}
