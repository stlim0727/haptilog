import type { DismissedArea } from "./recommendations.ts";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (owner: string) => `haptilog-location-hidden:${owner}`;
export const DISMISSAL_TTL_MS = 7 * 86_400_000;
type StoredDismissal = DismissedArea & { expires_at: number };
/** Expired and legacy entries are physically pruned on access, not just hidden from results. */
export function loadDismissals(storage: StorageLike, owner: string, now = Date.now()): StoredDismissal[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key(owner)) ?? "[]");
    if (!Array.isArray(value)) { storage.removeItem(key(owner)); return []; }
    const retained = value.filter((d): d is StoredDismissal => d && d.owner === owner &&
      Number.isFinite(d.latitude) && Math.abs(d.latitude) <= 90 && Number.isFinite(d.longitude) && Math.abs(d.longitude) <= 180 &&
      Number.isFinite(d.radius_meters) && d.radius_meters >= 150 && d.radius_meters <= 2_000 &&
      Number.isFinite(d.expires_at) && d.expires_at > now && d.expires_at <= now + DISMISSAL_TTL_MS).slice(-100);
    if (JSON.stringify(value) !== JSON.stringify(retained)) {
      if (retained.length) storage.setItem(key(owner), JSON.stringify(retained));
      else storage.removeItem(key(owner));
    }
    return retained;
  } catch { return []; }
}
export function saveDismissal(storage: StorageLike, owner: string, area: Omit<DismissedArea, "owner">, expiresAt = Date.now() + DISMISSAL_TTL_MS, now = Date.now()) {
  try {
    const expires_at = Math.min(expiresAt, now + DISMISSAL_TTL_MS);
    if (!Number.isFinite(expires_at) || expires_at <= now) return false;
    storage.setItem(key(owner), JSON.stringify([...loadDismissals(storage, owner, now), { ...area, owner, expires_at }].slice(-100))); return true;
  }
  catch { return false; }
}
export function clearDismissals(storage: StorageLike, owner: string) {
  try { storage.removeItem(key(owner)); return true; } catch { return false; }
}
/** Sign-out clears preferences for every previously connected owner on this browser. */
export function clearAllDismissals(storage: StorageLike & Pick<Storage, "length" | "key">) {
  try {
    for (let index = storage.length - 1; index >= 0; index--) {
      const storedKey = storage.key(index);
      if (storedKey?.startsWith("haptilog-location-hidden:")) storage.removeItem(storedKey);
    }
    return true;
  } catch { return false; }
}
