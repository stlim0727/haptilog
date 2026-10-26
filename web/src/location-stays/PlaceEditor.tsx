import { useState } from "react";
import { overlappingPlaces, validatePlace } from "./domain.ts";
import { PlaceMap } from "./PlaceMap.tsx";
import type { SavedPlace } from "./types.ts";
import "./stays.css";

export type PlaceDraft = Pick<SavedPlace, "name" | "latitude" | "longitude" | "radius_meters">;
export type PlaceSaveResult = { kind: "saved"; pendingApplication: boolean } | { kind: "conflict" };
/** Save callback must enforce owner authorization and expected-revision CAS on the server. */
export function PlaceEditor({ initial, places, editingId, expectedRevision, onSave, onCancel, lang = "ko" }: {
  initial: PlaceDraft; places: SavedPlace[]; editingId?: string; expectedRevision?: number;
  onSave: (draft: PlaceDraft, expectedRevision: number | undefined) => Promise<PlaceSaveResult>;
  onCancel: () => void; lang?: "ko" | "en";
}) {
  const [draft, setDraft] = useState(initial), [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  const ko = lang === "ko";
  const errors = validatePlace(draft, places, editingId);
  const overlaps = errors.length ? [] : overlappingPlaces(draft, places, editingId);
  const update = (next: Partial<PlaceDraft>) => { setDraft(d => ({ ...d, ...next })); setAcknowledged(false); setStatus(""); };
  return <form className="place-editor" onSubmit={async event => {
    event.preventDefault();
    if (busy || errors.length || overlaps.length > 0 && !acknowledged) return;
    setBusy(true); setStatus("");
    try {
      const result = await onSave({ ...draft, name: draft.name.trim() }, expectedRevision);
      setStatus(result.kind === "conflict" ? (ko ? "다른 변경이 있습니다. 최신 장소를 다시 불러와 변경을 확인하세요." : "Place changed elsewhere. Reload the latest place and review your changes.") :
        result.pendingApplication ? (ko ? "저장했습니다. 다음 위치 기록 세션에 적용됩니다." : "Saved. Applies to the next journal session.") : (ko ? "저장했습니다." : "Saved."));
    } catch { setStatus(ko ? "저장하지 못했습니다. 변경 내용을 유지했습니다. 다시 시도하세요." : "Could not save. Your draft is preserved; retry when connected."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}><legend>{ko ? "내 장소" : "My place"}</legend>
      <PlaceMap latitude={draft.latitude} longitude={draft.longitude} radius={draft.radius_meters} lang={lang} onSelect={(latitude, longitude) => update({ latitude, longitude })} />
      <label>{ko ? "이름" : "Name"}<input value={draft.name} onChange={e => update({ name: e.target.value })} required /></label>
      <label>{ko ? "위도" : "Latitude"}<input type="number" step="any" min="-90" max="90" value={Number.isFinite(draft.latitude) ? draft.latitude : ""} onChange={e => update({ latitude: e.target.valueAsNumber })} required /></label>
      <label>{ko ? "경도" : "Longitude"}<input type="number" step="any" min="-180" max="180" value={Number.isFinite(draft.longitude) ? draft.longitude : ""} onChange={e => update({ longitude: e.target.valueAsNumber })} required /></label>
      <label>{ko ? "반경 (m)" : "Radius (m)"}<input type="number" min="150" max="2000" value={Number.isFinite(draft.radius_meters) ? draft.radius_meters : ""} onChange={e => update({ radius_meters: e.target.valueAsNumber })} required /></label>
      {errors.length > 0 && <p role="alert">{ko ? "이름은 1–40자, 반경은 150–2,000m여야 하며 장소는 최대 20개입니다. 유효한 좌표를 입력하세요." : "Use a name of 1–40 characters, a 150–2,000m radius and valid coordinates. At most 20 places are allowed."}</p>}
      {overlaps.length > 0 && <label><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />{ko ? "겹치는 장소를 확인했습니다. 과거 기록의 장소는 자동 변경되지 않습니다." : "I reviewed overlapping places. Past associations will not change automatically."} ({overlaps.map(p => p.name).join(", ")})</label>}
      <button disabled={errors.length > 0 || overlaps.length > 0 && !acknowledged} type="submit">{ko ? "저장" : "Save"}</button>
      <button type="button" onClick={onCancel}>{ko ? "취소" : "Cancel"}</button>
    </fieldset>
    <p role="status">{status}</p>
  </form>;
}
