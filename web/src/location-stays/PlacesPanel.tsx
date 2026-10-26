import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { PlaceEditor } from "./PlaceEditor.tsx";
import type { PlaceDraft } from "./PlaceEditor.tsx";
import { LocationError } from "./repository.ts";
import type { SyncState } from "./repository.ts";
import type { LocationData } from "./useLocationStays.ts";
import "./stays.css";

/** Web is the only place editor: the watch collects stays, here they get names and rules. */
export default function PlacesPanel({ data, lang, isDemo = false }: {
  data: LocationData; lang: "ko" | "en"; isDemo?: boolean;
}) {
  const ko = lang === "ko";
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<{ initial: PlaceDraft; id?: string; revision: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | "all" | null>(null);
  const { repository, snapshot, places, suggestions, busy, error, errorText, message } = data;
  const cloudSyncOn = snapshot?.state.consent_enabled ?? false;
  const heading = ko ? "내 장소" : "Places";
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (error === "FORBIDDEN") { setEditor(null); setDeleteConfirm(null); }
  }, [error]);
  const close = () => { setOpen(false); setEditor(null); setDeleteConfirm(null); trigger.current?.focus(); };
  const newPlace = (latitude = 37.5, longitude = 127) => {
    if (!snapshot) return;
    setEditor({ initial: { name: "", latitude, longitude, radius_meters: 200 }, revision: snapshot.state.places_revision });
  };
  const savePlace = async (draft: PlaceDraft, revision: number | undefined, editingId?: string) => {
    if (!repository) throw new LocationError("UNAVAILABLE");
    try {
      await data.mutate(() => repository.putPlace({ ...draft, id: editingId ?? crypto.randomUUID() }, revision!));
      setEditor(null);
      data.setMessage(ko ? "장소를 저장했습니다. 과거 기록은 자동 변경되지 않습니다." : "Place saved. Past records were not changed automatically.");
      return { kind: "saved", pendingApplication: true } as const;
    } catch (e) {
      if (e instanceof LocationError && e.code === "REVISION_CONFLICT") return { kind: "conflict" } as const;
      throw e;
    }
  };
  let body: ReactNode;
  if (isDemo) body = <p>{ko ? "샘플 모드에서는 장소 기능을 사용하지 않습니다. 워치를 연결하면 체류가 음성 기록과 함께 표시됩니다." : "Places are unavailable in sample mode. Connect a watch to see stays with your recordings."}</p>;
  else if (!repository) body = <p>{ko ? "서버 연결을 사용할 수 없습니다. 음성 목록으로 돌아갈 수 있습니다." : "Server connection unavailable. You can return to your voice recordings."}</p>;
  else body = <section className="location-workspace" aria-label={heading}>
    <button type="button" disabled={busy} onClick={() => { data.setMessage(""); void data.load(); }}>{ko ? "새로고침" : "Refresh"}</button>
    {error && <p role="alert">{errorText}</p>}
    {message && <p role="status">{message}</p>}
    {!snapshot && !error && <p role="status">{ko ? "위치 정보를 불러오는 중…" : "Loading location data…"}</p>}
    {snapshot && <>
      <p>{ko
        ? "워치에서 시작한 위치 기록의 체류만 사용합니다. 워치의 클라우드 동기가 켜져 있으면 체류가 서버에 올라가고, 시작 후 7일 후에 사라집니다. 장소는 삭제할 때까지 유지됩니다."
        : "Only stays from journal sessions you start on the watch are used. While cloud sync is on the watch, stays are uploaded and expire seven days after starting. Saved places remain until deleted."}</p>
      <fieldset disabled={busy}>
        <legend>{heading} ({places.length}/20)</legend>
        <ul>{places.map(place => <li key={place.id}>{place.name} · {place.radius_meters}m
          <button type="button" disabled={!cloudSyncOn} onClick={() => setEditor({ initial: place, id: place.id, revision: snapshot.state.places_revision })}>{ko ? "편집" : "Edit"}</button>
          <button type="button" disabled={!cloudSyncOn} onClick={() => void data.perform(
            () => repository.deletePlace(place.id, snapshot.state.places_revision),
            ko ? "장소 정의를 삭제했습니다. 체류와 음성은 삭제하지 않았습니다." : "Place definition deleted. Stays and audio were retained.",
          )}>{ko ? "장소 삭제" : "Delete place"}</button>
        </li>)}</ul>
        <button type="button" disabled={!cloudSyncOn || places.length >= 20} onClick={() => newPlace()}>{ko ? "새 장소 추가" : "Add a place"}</button>
      </fieldset>
      {!cloudSyncOn && <p role="status">{ko ? "워치에서 클라우드 동기를 켜면 장소를 편집할 수 있습니다." : "Turn on cloud sync on the watch to edit places."}</p>}
      {cloudSyncOn && <label>{ko ? "체류 기준 시간" : "Stay threshold"}
        <select disabled={busy} value={snapshot.state.threshold_minutes} onChange={e => {
          const minutes = Number(e.target.value) as SyncState["threshold_minutes"];
          void data.perform(() => repository.setThreshold(minutes, snapshot.state.places_revision));
        }}>{[5, 10, 20, 30].map(minutes => <option key={minutes} value={minutes}>{minutes}{ko ? "분" : " minutes"}</option>)}</select>
      </label>}
      {cloudSyncOn && snapshot.state.places_revision > snapshot.state.applied_places_revision &&
        <p role="status">{ko ? "워치 적용 대기 · 다음 위치 기록 세션에 적용" : "Pending watch application · applies at the next journal session"}</p>}
      {editor && cloudSyncOn && <PlaceEditor key={`${editor.id ?? "new"}:${editor.initial.latitude}:${editor.initial.longitude}`}
        initial={editor.initial} places={places} editingId={editor.id} expectedRevision={editor.revision} lang={lang}
        onCancel={() => setEditor(null)}
        onReloadForReview={async () => {
          const next = await data.load();
          if (!next) throw new LocationError("NETWORK");
          return { revision: next.state.places_revision, place: next.places.find(place => place.id === editor.id) ?? null };
        }}
        onSave={(draft, revision) => savePlace(draft, revision, editor.id)} />}
      {cloudSyncOn && <section aria-label={ko ? "자주 머문 곳 추천" : "Frequent stay suggestions"}>
        <h3>{ko ? "자주 머문 곳" : "Frequently visited areas"}</h3>
        <p>{ko ? "최근 7일 중 서로 다른 2일 이상, 3회 이상 머문 곳입니다. 장소로 저장하지 않으면 숨길 수 있습니다." : "Areas with at least three stays on two different days in the last seven days. Hide any area you do not want to name."}</p>
        {!suggestions.length && <p>{ko ? "추천할 만큼 확인된 체류가 없습니다." : "Not enough confirmed stays for suggestions."}</p>}
        <ul>{suggestions.map(suggestion => <li key={`${suggestion.latitude}:${suggestion.longitude}`}>
          {suggestion.visits}{ko ? "회" : " visits"} · {suggestion.distinctDays}{ko ? "일" : " days"} · {Math.floor(suggestion.observedMillis / 60_000)}{ko ? "분 머묾" : " minutes observed"}
          <button type="button" disabled={busy || places.length >= 20} onClick={() => newPlace(suggestion.latitude, suggestion.longitude)}>{ko ? "장소로 저장" : "Save as a place"}</button>
          <button type="button" disabled={busy} onClick={() => void data.hideSuggestion(suggestion)}>{ko ? "추천 숨기기" : "Hide suggestion"}</button>
        </li>)}</ul>
      </section>}
      <button type="button" disabled={busy || !data.stays.length} onClick={() => setDeleteConfirm("all")}>{ko ? "서버 체류 전체 삭제" : "Delete all server stays"}</button>
      {deleteConfirm && <section aria-label={ko ? "체류 삭제 확인" : "Confirm stay deletion"}>
        <p>{ko ? "선택한 체류를 서버에서 삭제할까요? 다시 동기화해도 복원되지 않습니다. 음성과 내 장소 정의는 유지됩니다." : "Delete the selected server stays? Synchronization will not restore them. Audio and saved place definitions are retained."}</p>
        <button type="button" disabled={busy} onClick={() => void data.perform(async () => {
          await repository.deleteStays(deleteConfirm === "all" ? null : deleteConfirm, snapshot.state.sync_epoch);
          // Hidden-area summaries cannot reliably map to a single deleted segment: clear conservatively.
          data.clearSecrets();
          setDeleteConfirm(null);
        }, ko ? "체류를 삭제했습니다." : "Stays deleted.")}>{ko ? "체류 영구 삭제" : "Permanently delete stays"}</button>
        <button type="button" disabled={busy} onClick={() => setDeleteConfirm(null)}>{ko ? "취소" : "Cancel"}</button>
      </section>}
    </>}
  </section>;
  return <>
    <button ref={trigger} className="secondary-button" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <MapPin size={16} /> {heading}
    </button>
    <dialog ref={dialog} className="location-dialog" aria-label={heading} onCancel={event => { event.preventDefault(); close(); }}>
      <button type="button" onClick={close}>{ko ? "닫기" : "Close"}</button>
      {open && body}
    </dialog>
  </>;
}
