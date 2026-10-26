import type { DismissedArea } from "./recommendations.ts";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (owner: string) => `haptilog-location-hidden:${owner}`;
/** Browser-local preference only. Never persisted with labels or a cross-owner global key. */
export function loadDismissals(storage: StorageLike, owner: string): DismissedArea[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key(owner)) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((d): d is DismissedArea => d && d.owner === owner &&
      Number.isFinite(d.latitude) && Math.abs(d.latitude) <= 90 && Number.isFinite(d.longitude) && Math.abs(d.longitude) <= 180 &&
      Number.isFinite(d.radius_meters) && d.radius_meters >= 150 && d.radius_meters <= 2_000).slice(-100);
  } catch { return []; }
}
export function saveDismissal(storage: StorageLike, owner: string, area: Omit<DismissedArea, "owner">) {
  try { storage.setItem(key(owner), JSON.stringify([...loadDismissals(storage, owner), { ...area, owner }].slice(-100))); return true; }
  catch { return false; }
}
export function clearDismissals(storage: StorageLike, owner: string) {
  try { storage.removeItem(key(owner)); return true; } catch { return false; }
}
