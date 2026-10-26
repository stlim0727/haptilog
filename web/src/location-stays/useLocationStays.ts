import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { visibleStay } from "./domain.ts";
import { clearDismissals, loadDismissals, saveDismissal } from "./dismissals.ts";
import { LocationError } from "./repository.ts";
import type { LocationRepository, Snapshot } from "./repository.ts";
import { recommendPlaces } from "./recommendations.ts";
import type { Suggestion } from "./recommendations.ts";

/** One owner's stays and places, kept fresh for the journal feed and the places panel. */
export function useLocationStays({ owner, repository, lang }: {
  owner: string; repository: LocationRepository | null; lang: "ko" | "en";
}) {
  const ko = lang === "ko";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const [dismissals, setDismissals] = useState(() => loadDismissals(localStorage, owner));
  const generation = useRef(0), mounted = useRef(true), mutating = useRef(false);
  const load = useCallback(async () => {
    if (!repository) return null;
    const token = ++generation.current;
    try {
      const next = await repository.snapshot();
      if (!mounted.current || token !== generation.current) return null;
      setSnapshot(next); setError("");
      if (!next.state.consent_enabled) { clearDismissals(localStorage, owner); setDismissals([]); }
      return next;
    } catch (e) {
      if (!mounted.current || token !== generation.current) return null;
      const code = e instanceof LocationError ? e.code : "NETWORK";
      if (code === "FORBIDDEN") {
        setSnapshot(null); clearDismissals(localStorage, owner); setDismissals([]);
      }
      setError(code);
    }
    return null;
  }, [repository, owner]);
  useEffect(() => {
    mounted.current = true;
    // An owner or session switch must not leave the previous journal on screen.
    setSnapshot(null); setDismissals(loadDismissals(localStorage, owner)); void load();
    const timer = setInterval(() => {
      setNow(Date.now()); setDismissals(loadDismissals(localStorage, owner));
      if (document.visibilityState === "visible" && !mutating.current) void load();
    }, 30_000);
    const visible = () => { setNow(Date.now()); if (document.visibilityState === "visible" && !mutating.current) void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { mounted.current = false; generation.current++; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [load, owner]);
  const mutate = useCallback(async (operation: () => Promise<unknown>) => {
    if (!repository) throw new LocationError("UNAVAILABLE");
    if (mutating.current) throw new LocationError("BUSY");
    mutating.current = true; generation.current++; setBusy(true); setError(""); setMessage("");
    try {
      await operation();
      if (mounted.current) await load();
    } catch (e) {
      if (mounted.current && e instanceof LocationError && e.code === "FORBIDDEN") {
        setSnapshot(null); clearDismissals(localStorage, owner); setDismissals([]); setError("FORBIDDEN");
      }
      throw e;
    } finally {
      mutating.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [repository, load, owner]);
  /** False means the operation failed and its reason is already in `error`. */
  const perform = useCallback(async (operation: () => Promise<unknown>, success?: string) => {
    try { await mutate(operation); if (mounted.current && success) setMessage(success); return true; }
    catch (e) { if (mounted.current) setError(e instanceof LocationError ? e.code : "NETWORK"); return false; }
  }, [mutate]);
  const places = snapshot?.places ?? [];
  const stays = useMemo(() => snapshot?.stays.filter(stay => visibleStay(stay, now)) ?? [], [snapshot, now]);
  const suggestions = useMemo(() => snapshot?.state.consent_enabled
    ? recommendPlaces({ owner, stays: snapshot.stays, places, dismissed: dismissals, now, timeZone }) : [],
  [snapshot, places, owner, dismissals, now, timeZone]);
  const hideSuggestion = useCallback((suggestion: Suggestion) => {
    const sourceExpiry = Math.min(...stays.filter(stay => suggestion.stayIds.includes(stay.id))
      .map(stay => Date.parse(stay.started_at) + 7 * 86_400_000));
    const saved = saveDismissal(localStorage, owner,
      { latitude: suggestion.latitude, longitude: suggestion.longitude, radius_meters: 200 }, sourceExpiry);
    if (mounted.current) {
      setDismissals(loadDismissals(localStorage, owner));
      if (!saved) setMessage(ko ? "이 브라우저에 추천 숨김을 저장하지 못했습니다." : "Could not save hidden suggestions in this browser.");
    }
    return saved;
  }, [stays, owner, ko]);
  const clearSecrets = useCallback(() => {
    clearDismissals(localStorage, owner); setDismissals([]);
  }, [owner]);
  const errorText = error === "UNAVAILABLE"
    ? (ko ? "장소 기능을 아직 사용할 수 없습니다. 음성 기록은 계속 사용할 수 있습니다." : "Places are not available on this server yet. Voice recordings remain available.")
    : error === "FORBIDDEN"
      ? (ko ? "위치 정보 접근 권한이 만료되었습니다. 워치를 다시 연결하세요." : "Location access expired. Reconnect your watch.")
      : error === "REVISION_CONFLICT" || error === "EPOCH_CONFLICT"
        ? (ko ? "다른 변경이 있습니다. 새로고침 후 내용을 확인하고 다시 시도하세요." : "Data changed elsewhere. Refresh, review and retry.")
        : error === "CONSENT_REQUIRED"
          ? (ko ? "워치에서 클라우드 동기를 켜면 체류와 장소를 볼 수 있습니다." : "Turn on cloud sync on the watch to see places and stays.")
          : (ko ? "위치 정보를 불러오거나 변경하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요." : "Could not load or update location data. Check your connection and retry.");
  return { repository, snapshot, places, stays, suggestions, dismissals, now, timeZone, error, errorText, message, busy, setMessage, setError, load, perform, mutate, hideSuggestion, clearSecrets };
}
export type LocationData = ReturnType<typeof useLocationStays>;
