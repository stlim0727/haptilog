import { useCallback, useEffect, useMemo, useRef, useState } from "react";


import { visibleStay, RETENTION_MS } from "./domain.ts";
import { clearDismissals, loadDismissals, saveDismissal } from "./dismissals.ts";
import { PlaceEditor } from "./PlaceEditor.tsx";
import type { PlaceDraft } from "./PlaceEditor.tsx";
import { recommendPlaces } from "./recommendations.ts";
import { LocationError } from "./repository.ts";
import type { LocationRepository, SyncState } from "./repository.ts";

import type { Stay } from "./types.ts";
import type { LocationJournal } from "./useLocationJournal.ts";
import "./stays.css";

export function LocationWorkspace({ owner, repository, journal, initialStay, lang = "ko" }: {
  owner: string; repository: LocationRepository; journal: LocationJournal; initialStay?: Stay | null; lang?: "ko" | "en";
}) {
  const ko = lang === "ko", timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { snapshot, replace: setSnapshot, now, checkedAt } = journal;
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");

  const [backfill, setBackfill] = useState(false), [deleteConfirm, setDeleteConfirm] = useState<string[] | "all" | null>(null);

  const [editor, setEditor] = useState<{ initial: PlaceDraft; id?: string; revision: number } | null>(null);
  const [dismissals, setDismissals] = useState(() => loadDismissals(localStorage, owner));
  const generation = useRef(0), mounted = useRef(true), mutating = useRef(false);
  const load = useCallback(async () => {
    const token = ++generation.current;
    try {
      const next = await journal.load();
      if (!next) return;
      if (!mounted.current || token !== generation.current) return;
      setError("");
      if (!next.state.consent_enabled) { clearDismissals(localStorage, owner); setDismissals([]); }
      return next;
    } catch (e) {
      if (!mounted.current || token !== generation.current) return;
      const code = e instanceof LocationError ? e.code : "NETWORK";
      if (code === "FORBIDDEN") {
        setSnapshot(null); setEditor(null); setDeleteConfirm(null);
        clearDismissals(localStorage, owner); setDismissals([]);
      }
      setError(code);
    }
  }, [repository, owner, journal.load]);
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; generation.current++; };
  }, [load, owner]);
  useEffect(() => { setError(journal.error); if (journal.error === "FORBIDDEN") { setEditor(null); setDeleteConfirm(null); } }, [journal.error]);
  useEffect(() => {
    if (initialStay && snapshot?.state.consent_enabled) setEditor({ initial: { name: "", latitude: initialStay.representative_latitude, longitude: initialStay.representative_longitude, radius_meters: 200 }, revision: snapshot.state.places_revision });
  }, [initialStay?.id]);
  useEffect(() => {
    if (snapshot && !snapshot.state.consent_enabled) { setEditor(null); setDeleteConfirm(null); setDismissals([]); }
  }, [snapshot?.state.consent_enabled]);
  const mutate = async (operation: () => Promise<unknown>) => {
    if (mutating.current) throw new LocationError("BUSY");
    mutating.current = true; generation.current++; setBusy(true); setError(""); setMessage("");
    try {
      await journal.mutate(operation);
      if (mounted.current) setError("");
    } catch (e) {
      if (mounted.current && e instanceof LocationError && e.code === "FORBIDDEN") {
        setSnapshot(null); setEditor(null); setDeleteConfirm(null);
        clearDismissals(localStorage, owner); setDismissals([]); setError("FORBIDDEN");
      }
      throw e;
    } finally {
      mutating.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const perform = async (operation: () => Promise<unknown>, success?: string) => {
    try { await mutate(operation); if (mounted.current && success) setMessage(success); }
    catch (e) { if (mounted.current) setError(e instanceof LocationError ? e.code : "NETWORK"); }
  };
  const stays = snapshot?.stays.filter(stay => visibleStay(stay, now)) ?? [];
  const places = snapshot?.places ?? [];
  const suggestions = useMemo(() => snapshot?.state.consent_enabled ? recommendPlaces({ owner, stays: snapshot.stays, places: snapshot.places, dismissed: dismissals, now, timeZone }) : [], [snapshot, owner, dismissals, now, timeZone]);
  const newPlace = (latitude = 37.5, longitude = 127) => {
    if (!snapshot) return;
    setEditor({ initial: { name: "", latitude, longitude, radius_meters: 200 }, revision: snapshot.state.places_revision });
  };
  const errorText = error === "UNAVAILABLE" ? (ko ? "장소 기능을 아직 사용할 수 없습니다. 음성 기록은 계속 사용할 수 있습니다." : "Places are not available on this server yet. Voice recordings remain available.") :
    error === "FORBIDDEN" ? (ko ? "위치 정보 접근 권한이 만료되었습니다. 워치를 다시 연결하세요." : "Location access expired. Reconnect your watch.") :
      error === "REVISION_CONFLICT" || error === "EPOCH_CONFLICT" ? (ko ? "다른 변경이 있습니다. 새로고침 후 내용을 확인하고 다시 시도하세요." : "Data changed elsewhere. Refresh, review and retry.") :
        error === "CONSENT_REQUIRED" ? (ko ? "장소·체류 동기화에 별도 동의가 필요합니다." : "Separate location synchronization consent is required.") :
          (ko ? "위치 정보를 불러오거나 변경하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요." : "Could not load or update location data. Check your connection and retry.");
  return <section className="location-workspace" aria-label={ko ? "장소 설정" : "Place settings"}>
    <h2>{ko ? "장소 설정" : "Place settings"}</h2>
    <p>{ko ? "체류는 음성과 함께 기록 목록에 표시됩니다. 수집은 워치에서 직접 시작하세요." : "Stays appear alongside voice recordings in your journal. Start collection on your watch."}</p>
    <button type="button" disabled={busy} onClick={() => { setMessage(""); void load(); }}>{ko ? "새로고침" : "Refresh"}</button>
    {checkedAt && <p>{ko ? "서버 확인" : "Server checked"}: {new Date(checkedAt).toLocaleString(ko ? "ko-KR" : "en-US", { timeZone })} · {ko ? "현재 워치 상태를 보장하지 않습니다." : "Does not confirm current watch presence."}</p>}
    {error && <p role="alert">{errorText}</p>}
    {message && <p role="status">{message}</p>}
    {!snapshot && !error && <p role="status">{ko ? "위치 정보를 불러오는 중…" : "Loading location data…"}</p>}
    {snapshot && <>
      <section aria-label={ko ? "위치 동기화 설정" : "Location synchronization settings"}>
        <h3>{ko ? "웹에도 표시" : "Show on the web"}</h3>
        <p role="status">{snapshot.state.consent_enabled ? (ko ? "동기화 켜짐 · 워치가 연결되면 업로드합니다." : "Sync on · uploads when the watch connects.") : (ko ? "동기화 꺼짐" : "Sync off")}</p>
        <p>{ko ? "저장한 장소와 체류 위치·시간·정확도를 서버에 보냅니다. 체류는 시작 후 7일간 보관합니다. 이동 경로는 워치에만 남습니다." : "Sends saved places and stay locations, times and accuracy to the server. Stays are kept for seven days from their start. Movement trails stay on your watch."}</p>
        <details><summary>{ko ? "동기화 자세히 보기" : "About synchronization"}</summary><p>{ko ? "음성 클라우드 동의와 별개입니다. 저장한 장소와 체류 대표 좌표·시각·위치 정확도가 서버로 전송됩니다. 원시 이동 경로는 업로드하지 않습니다. 체류는 시작 후 7일 보존되며, 내 장소는 삭제할 때까지 유지됩니다. 위치 기록은 Gemini에 보내지 않습니다. 수집과 워치의 웹 동기화는 워치에서 직접 켜야 합니다." : "Separate from voice cloud consent. Saved places and stay summary coordinates, times and accuracy are sent to the server. Raw movement trails are not uploaded. Stays expire seven days after starting; saved places remain until deleted. Location journal data is not sent to Gemini. Enabling sync here does not start collection or activate a watch that has never opted in; enable web sync on the watch too."}</p></details>
        {!snapshot.state.consent_enabled && <label><input type="checkbox" checked={backfill} disabled={busy} onChange={e => setBackfill(e.target.checked)} />{ko ? "이전에 기록한 체류도 포함 · 워치에 남아 있는 최근 7일" : "Include previous stays · retained on the watch from the last seven days"}</label>}
        {!snapshot.state.consent_enabled && <p className="location-secondary">{ko ? "이미 시작한 체류도 표시하려면 이전 체류 포함을 켜세요." : "Include previous stays to show a stay that has already started."}</p>}
        <button type="button" disabled={busy} onClick={() => {
          const state = snapshot.state;
          void perform(async () => {
            await repository.consent(!state.consent_enabled, state.consent_revision, backfill);
            if (state.consent_enabled) { setEditor(null); clearDismissals(localStorage, owner); setDismissals([]); }
          }, state.consent_enabled ? (ko ? "앞으로의 업로드를 중단했어요. 이미 업로드한 기록은 남아 있어요. 오프라인 워치는 다음 연결 때 적용됩니다." : "Future uploads are stopped. Previously uploaded records remain. Offline watches receive the change on their next connection.") : (ko ? "설정을 저장했습니다. 워치에서도 웹 동기화를 켜 주세요." : "Saved. Enable web sync on the watch too."));
        }}>{snapshot.state.consent_enabled ? (ko ? "동기화 끄기" : "Turn off sync") : (ko ? "동의하고 동기화 켜기" : "Agree and enable sync")}</button>
        <p>{ko ? "동의 철회는 기존 서버 데이터를 삭제하지 않습니다. 아래 삭제 기능을 별도로 사용하세요. 오프라인 워치는 다음 연결 때 변경을 받습니다." : "Revoking consent does not delete existing server data. Use deletion separately below. Offline watches receive changes on their next connection."}</p>
        {snapshot.state.consent_enabled && <label>{ko ? "공통 체류 기준" : "Shared stay threshold"}
          <select disabled={busy} value={snapshot.state.threshold_minutes} onChange={e => {
            const minutes = Number(e.target.value) as SyncState["threshold_minutes"];
            void perform(() => repository.setThreshold(minutes, snapshot.state.places_revision));
          }}>{[5, 10, 20, 30].map(minutes => <option key={minutes} value={minutes}>{minutes}{ko ? "분" : " minutes"}</option>)}</select>
        </label>}
        <p>{snapshot.state.places_revision > snapshot.state.applied_places_revision ? (ko ? "워치 적용 대기 · 다음 위치 기록 세션에 적용" : "Pending watch application · applies at the next journal session") : (ko ? "워치에 설정 적용됨" : "Settings applied on the watch")}</p>
      </section>
      <fieldset disabled={busy}>
        <legend>{ko ? "내 장소" : "My places"} ({places.length}/20)</legend>
        <ul>{places.map(place => <li key={place.id}>{place.name} · {place.radius_meters}m
          <button type="button" disabled={!snapshot.state.consent_enabled} onClick={() => setEditor({ initial: place, id: place.id, revision: snapshot.state.places_revision })}>{ko ? "편집" : "Edit"}</button>
          <button type="button" disabled={!snapshot.state.consent_enabled} onClick={() => void perform(() => repository.deletePlace(place.id, snapshot.state.places_revision), ko ? "장소 정의를 삭제했습니다. 체류와 음성은 삭제하지 않았습니다." : "Place definition deleted. Stays and audio were retained.")}>{ko ? "장소 삭제" : "Delete place"}</button>
        </li>)}</ul>
        <button type="button" disabled={!snapshot.state.consent_enabled || places.length >= 20} onClick={() => newPlace()}>{ko ? "지도에서 장소 추가" : "Add a place on the map"}</button>
      </fieldset>
      {editor && snapshot.state.consent_enabled && <PlaceEditor key={`${editor.id ?? "new"}:${editor.initial.latitude}:${editor.initial.longitude}`} initial={editor.initial} places={places} editingId={editor.id} expectedRevision={editor.revision} lang={lang} onCancel={() => setEditor(null)} onReloadForReview={async () => {
        const next = await load();
        if (!next) throw new LocationError("NETWORK");
        return { revision: next.state.places_revision, place: next.places.find(place => place.id === editor.id) ?? null };
      }} onSave={async (draft, revision) => {
        try {
          await mutate(() => repository.putPlace({ ...draft, id: editor.id ?? crypto.randomUUID() }, revision!));
          if (mounted.current) { setEditor(null); setMessage(ko ? "장소를 저장했습니다. 과거 기록은 자동 변경되지 않습니다." : "Place saved. Past records were not changed automatically."); }
          return { kind: "saved", pendingApplication: true };
        } catch (e) { if (e instanceof LocationError && e.code === "REVISION_CONFLICT") return { kind: "conflict" }; throw e; }
      }} />}
      {snapshot.state.consent_enabled && <section aria-label={ko ? "자주 머문 곳 추천" : "Frequent stay suggestions"}>
        <h3>{ko ? "자주 머문 곳" : "Frequently visited areas"}</h3>
        <p>{ko ? "최근 7일 중 서로 다른 2일 이상, 3회 이상 체류한 곳입니다. 추천 조건은 초기 기준이며 실제 방문과 다를 수 있습니다." : "Areas with at least three stays on two different days in the last seven days. These provisional rules may differ from actual visits."}</p>
        <p>{ko ? "숨긴 추천은 이 브라우저에서 관련 체류가 만료되기 전까지 최대 7일 유지됩니다. 체류 삭제·동의 철회·로그아웃 시 숨김 설정도 지웁니다." : "Hidden suggestions remain in this browser for up to seven days, ending when their source stays expire. Deleting stays, revoking consent or signing out also clears hidden suggestions."}</p>
        {!suggestions.length && <p>{ko ? "추천할 만큼 확인된 체류가 없습니다." : "Not enough confirmed stays for suggestions."}</p>}
        <ul>{suggestions.map(suggestion => <li key={`${suggestion.latitude}:${suggestion.longitude}`}>
          {suggestion.visits}{ko ? "회" : " visits"} · {suggestion.distinctDays}{ko ? "일" : " days"} · {Math.floor(suggestion.observedMillis / 60_000)}{ko ? "분 관측" : " minutes observed"}
          <button type="button" disabled={busy || places.length >= 20} onClick={() => newPlace(suggestion.latitude, suggestion.longitude)}>{ko ? "장소로 저장" : "Save as a place"}</button>
          <button type="button" disabled={busy} onClick={() => {
            const sourceExpiry = Math.min(...stays.filter(stay => suggestion.stayIds.includes(stay.id)).map(stay => Date.parse(stay.started_at) + RETENTION_MS));
            const saved = saveDismissal(localStorage, owner, { latitude: suggestion.latitude, longitude: suggestion.longitude, radius_meters: 200 }, sourceExpiry);
            if (saved) setDismissals(loadDismissals(localStorage, owner));
            else setMessage(ko ? "이 브라우저에 추천 숨김을 저장하지 못했습니다." : "Could not save hidden suggestions in this browser.");
          }}>{ko ? "추천 숨기기" : "Hide suggestion"}</button>
        </li>)}</ul>
      </section>}
      <button type="button" disabled={busy || !stays.length} onClick={() => setDeleteConfirm("all")}>{ko ? "서버 체류 전체 삭제" : "Delete all server stays"}</button>
      {deleteConfirm && <section aria-label={ko ? "체류 삭제 확인" : "Confirm stay deletion"}>
        <p>{ko ? "선택한 체류를 서버에서 삭제할까요? 다시 동기화해도 복원되지 않습니다. 음성과 내 장소 정의는 유지됩니다." : "Delete the selected server stays? Synchronization will not restore them. Audio and saved place definitions are retained."}</p>
        <button type="button" disabled={busy} onClick={() => {
          const ids = deleteConfirm === "all" ? null : deleteConfirm;
          void perform(async () => {
            await repository.deleteStays(ids, snapshot.state.sync_epoch);
            setSnapshot({ ...snapshot, stays: snapshot.stays.filter(stay => ids !== null && !ids.includes(stay.id)) }); setEditor(null);
            // Hidden-area summaries cannot reliably map to a single deleted segment: clear conservatively.
            clearDismissals(localStorage, owner); setDismissals([]);
            if (mounted.current) setDeleteConfirm(null);
          });
        }}>{ko ? "체류 영구 삭제" : "Permanently delete stays"}</button>
        <button type="button" disabled={busy} onClick={() => setDeleteConfirm(null)}>{ko ? "취소" : "Cancel"}</button>
      </section>}
    </>}
  </section>;
}
