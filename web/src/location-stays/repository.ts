import { stayValid, validatePlace } from "./domain.ts";
import type { SavedPlace, Stay } from "./types.ts";

export type SyncState = {
  consent_scope?: "location_only" | "all_records";
  consent_enabled: boolean; consent_revision: number; sync_epoch: number;
  upload_cutoff: string | null; places_revision: number; applied_places_revision: number;
  threshold_minutes: 5 | 10 | 20 | 30;
};
export type Snapshot = { protocol_version: 1; state: SyncState; places: SavedPlace[]; stays: Stay[]; deleted_ids: string[] };
export type LocationAction = "snapshot" | "consent" | "put_place" | "delete_place" | "set_threshold" | "delete_stays";
export type RpcTransport = (name: string, args: { p_owner: string; p_action: LocationAction; p_payload: Record<string, unknown> }) => PromiseLike<{ data: unknown; error: unknown; status?: number }>;
export class LocationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "LocationError"; }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const counter = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
export function parseSnapshot(value: unknown): Snapshot {
  if (!object(value) || value.protocol_version !== 1 || !object(value.state) || !Array.isArray(value.places) || !Array.isArray(value.stays) || !Array.isArray(value.deleted_ids)) throw new LocationError("INVALID_RESPONSE");
  const s = value.state;
  if (typeof s.consent_enabled !== "boolean" || ![s.consent_revision, s.sync_epoch, s.places_revision, s.applied_places_revision].every(counter) ||
    ![5, 10, 20, 30].includes(s.threshold_minutes as number) ||
    !(s.upload_cutoff === null || typeof s.upload_cutoff === "string" && Number.isFinite(Date.parse(s.upload_cutoff))) ||
    !value.deleted_ids.every(id => typeof id === "string") || value.places.length > 20) throw new LocationError("INVALID_RESPONSE");
  const places = value.places.map(p => {
    if (!object(p) || typeof p.id !== "string" || !counter(p.revision) || typeof p.name !== "string" ||
      typeof p.latitude !== "number" || typeof p.longitude !== "number" || typeof p.radius_meters !== "number" ||
      validatePlace(p as SavedPlace, []).length) throw new LocationError("INVALID_RESPONSE");
    return { id: p.id, revision: p.revision, name: p.name, latitude: p.latitude, longitude: p.longitude, radius_meters: p.radius_meters } as SavedPlace;
  });
  if (!value.stays.every(stay => object(stay) && stayValid(stay as Stay))) throw new LocationError("INVALID_RESPONSE");
  const deleted = new Set(value.deleted_ids as string[]);
  return { protocol_version: 1, state: s as SyncState, places, stays: (value.stays as Stay[]).filter(stay => !deleted.has(stay.id)), deleted_ids: value.deleted_ids as string[] };
}
/** Owner comes from the existing portal connection; the RPC must independently authorize it. */
export function createLocationRepository(owner: string, rpc: RpcTransport) {
  async function call(action: LocationAction, payload: Record<string, unknown> = {}) {
    const { data, error, status } = await rpc("location_stays", { p_owner: owner, p_action: action, p_payload: payload });
    if (error) {
      const code = object(error) && typeof error.code === "string" ? error.code : "NETWORK";
      const forbidden = status === 401 || status === 403 || ["401", "403", "42501", "PGRST301", "PGRST302", "PGRST303"].includes(code);
      throw new LocationError(forbidden ? "FORBIDDEN" : ["PGRST202", "42883"].includes(code) ? "UNAVAILABLE" : "NETWORK");
    }
    if (!object(data)) throw new LocationError("INVALID_RESPONSE");
    if (typeof data.error === "string") throw new LocationError(data.error);
    return data;
  }
  return {
    snapshot: async () => parseSnapshot(await call("snapshot")),
    consent: (enabled: boolean, expectedRevision: number, backfill = false) => call("consent", { enabled, expected_revision: expectedRevision, backfill }),
    putPlace: (place: Omit<SavedPlace, "revision">, expectedRevision: number) => call("put_place", { ...place, expected_revision: expectedRevision }),
    deletePlace: (id: string, expectedRevision: number) => call("delete_place", { id, expected_revision: expectedRevision }),
    setThreshold: (minutes: SyncState["threshold_minutes"], expectedRevision: number) => call("set_threshold", { threshold_minutes: minutes, expected_revision: expectedRevision }),
    deleteStays: (ids: string[] | null, expectedEpoch: number) => call("delete_stays", { ids, expected_epoch: expectedEpoch }),
  };
}
export type LocationRepository = ReturnType<typeof createLocationRepository>;
