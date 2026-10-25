import { useEffect, useState } from "react";
import { supabase } from "./client";
import type { Recording } from "./domain";
import { latest, transcript } from "./domain";
import {
  isDemoSessionActive,
  getStoredDemoRecords,
  saveStoredDemoRecords,
} from "./demo";

type Revision = { id: number; created_at: string; before_value: { transcript?: string | null } | null; after_value: { transcript?: string | null } };

export function TranscriptEditor({ recording, lang, onChange, onError, onDirtyChange }: {
  recording: Recording; lang: "ko" | "en";
  onChange: () => Promise<void>; onError: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const ko = lang === "ko";
  const current = transcript(recording);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onDirtyChange?.((editing && draft !== current) || busy); }, [editing, draft, current, busy, onDirtyChange]);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    if (!historyOpen || !supabase) return;
    let active = true;
    setHistory(null);
    setHistoryError(false);
    supabase.from("recording_correction_history").select("id,created_at,before_value,after_value")
      .eq("recording_id", recording.id).order("id", { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (active) { setHistoryError(!!error); setHistory(error ? [] : data as Revision[]); }
      });
    return () => { active = false; };
  }, [historyOpen, recording.id, recording.recording_corrections?.updated_at]);
  async function save() {
    setBusy(true);
    if (isDemoSessionActive() || recording.id.startsWith("demo-")) {
      const stored = getStoredDemoRecords() ?? [];
      const updated = stored.map((r) => {
        if (r.id !== recording.id) return r;
        return {
          ...r,
          recording_corrections: {
            ...(r.recording_corrections ?? {
              recording_id: r.id,
              amount: null,
              currency: null,
              merchant: null,
              category: null,
              completed_tasks: [],
              updated_at: new Date().toISOString(),
            }),
            transcript: draft,
            updated_at: new Date().toISOString(),
          },
        };
      });
      saveStoredDemoRecords(updated);
      await onChange();
      setEditing(false);
      setBusy(false);
      return;
    }
    if (!supabase) return;
    try {
      const { error } = await supabase.from("recording_corrections").upsert(
        { recording_id: recording.id, transcript: draft, updated_at: new Date().toISOString() },
        { onConflict: "recording_id", defaultToNull: false },
      );
      if (error) throw error;
      await onChange();
      setEditing(false);
    } catch {
      onError(ko ? "저장하지 못했습니다. 다시 시도해 주세요." : "Could not save. Please try again.");
    } finally { setBusy(false); }
  }
  return <section className="transcript-editor">
    {editing ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>{ko ? "해석된 텍스트" : "Transcript"}
        <textarea autoFocus rows={7} maxLength={50000} value={draft} disabled={busy}
          onChange={event => setDraft(event.target.value)} />
      </label>
      <button className="secondary-button" disabled={busy || draft === current}>
        {busy ? (ko ? "저장 중…" : "Saving…") : (ko ? "저장" : "Save")}
      </button>{" "}
      <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(false)}>{ko ? "취소" : "Cancel"}</button>
    </form> : <>
      <p className="transcript">{current || (ko ? "인식된 음성이 없습니다." : "No speech detected.")}</p>
      {!recording.deleted_at && <button className="secondary-button" onClick={() => { setDraft(current); setEditing(true); }}>{ko ? "텍스트 편집" : "Edit transcript"}</button>}
    </>}
    <details onToggle={event => setOriginalOpen(event.currentTarget.open)}><summary>{ko ? "원본 AI 텍스트" : "Original AI transcript"}</summary>
      {originalOpen && <p className="transcript">{latest(recording)?.transcript}</p>}
    </details>
    <details onToggle={event => setHistoryOpen(event.currentTarget.open)}>
      <summary>{ko ? "편집 이력" : "Edit history"}</summary>
      <p>{ko ? "최근 변경 최대 100건. 원본 음성과 AI 결과는 보존됩니다." : "Up to 100 latest changes. Original audio and AI output are preserved."}</p>
      {historyError ? <p role="alert">{ko ? "이력을 불러오지 못했습니다. 닫았다 다시 열어 주세요." : "Could not load history. Close and reopen to retry."}</p>
        : history === null ? <p>{ko ? "불러오는 중…" : "Loading…"}</p>
        : <>{history.filter(item => (item.before_value?.transcript ?? null) !== (item.after_value.transcript ?? null)).length === 0 && <p>{ko ? "텍스트 편집 이력이 없습니다." : "No transcript edits yet."}</p>}
          {history.filter(item => (item.before_value?.transcript ?? null) !== (item.after_value.transcript ?? null)).map(item => <article key={item.id}>
            <time>{new Date(item.created_at).toLocaleString()}</time>
            <p>{ko ? "이전" : "Before"}</p><p className="transcript">{item.before_value?.transcript ?? (ko ? "원본 AI 텍스트 사용" : "Original AI transcript")}</p>
            <p>{ko ? "이후" : "After"}</p><p className="transcript">{item.after_value.transcript ?? (ko ? "원본 AI 텍스트 사용" : "Original AI transcript")}</p>
          </article>)}
        </>}
    </details>
  </section>;
}
