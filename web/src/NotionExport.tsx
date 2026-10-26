import { useEffect, useRef, useState } from "react";
import { supabase } from "./client";
import { latest } from "./domain";
import type { Recording } from "./domain";
import "./notion.css";

type ExportState = {
  recording_id: string;
  state: string;
  error_code: string | null;
  exported_at: string | null;
};
type Target = { id: string; name: string };
type Status = {
  configured: boolean;
  connected: boolean;
  workspace?: string;
  target: Target | null;
  exports: ExportState[];
};
const callback = (() => {
  const url = new URL(window.location.href);
  if (url.searchParams.get("notion") !== "callback") return null;
  const result = {
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
  };
  for (const key of ["code", "state", "error", "error_description", "notion"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url.href);
  return result;
})();
let callbackTaken = false;
export function notionError(code: string, ko: boolean) {
  const messages: Record<string, [string, string]> = {
    ACCESS_REQUIRED: [
      "Browser access expired. Pair your watch again.",
      "브라우저 접근 권한이 만료되었습니다. 워치를 다시 연결하세요.",
    ],
    BUSY: [
      "Another operation is running. Wait a moment and try again.",
      "다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.",
    ],
    NOT_CONFIGURED: [
      "Notion is not configured on this server yet.",
      "서버의 Notion 연결 설정이 아직 준비되지 않았습니다.",
    ],
    CONNECT_REQUIRED: ["Connect Notion first.", "먼저 Notion을 연결하세요."],
    TARGET_REQUIRED: ["Choose an inbox first.", "먼저 인박스를 선택하세요."],
    TARGET_SCHEMA: [
      "This inbox has incompatible fields. Use a separate table with Recorded at (date), Type (text), HaptiLog ID (text), and HaptiLog (URL). Missing fields are added when you select it.",
      "인박스 속성 형식이 맞지 않습니다. 별도 표에 Recorded at(날짜), Type(텍스트), HaptiLog ID(텍스트), HaptiLog(URL)를 사용하세요. 없는 속성은 선택 시 추가됩니다.",
    ],
    NOTION_PERMISSION: [
      "The page or inbox is unavailable. Check sharing permissions or choose another inbox.",
      "페이지 또는 인박스에 접근할 수 없습니다. 공유 권한을 확인하거나 다른 인박스를 선택하세요.",
    ],
    NOTION_RATE_LIMIT: [
      "Notion is limiting requests. Wait at least a minute before retrying.",
      "Notion 요청이 제한되었습니다. 1분 이상 기다린 후 다시 시도하세요.",
    ],
    RECONNECT_REQUIRED: [
      "Reconnect Notion to renew access.",
      "접근 권한 갱신을 위해 Notion을 다시 연결하세요.",
    ],
    OAUTH_EXPIRED: [
      "Authorization expired or was already used. Connect Notion again.",
      "인증이 만료되었거나 이미 사용되었습니다. Notion을 다시 연결하세요.",
    ],
    RECORDING_UNAVAILABLE: [
      "This recording is unavailable or in trash.",
      "기록이 없거나 휴지통에 있습니다.",
    ],
    RECOVERY_PENDING: [
      "A previous create request may have succeeded. Retry later to recover its page. No duplicate will be created.",
      "이전 페이지 생성 결과를 확인 중입니다. 나중에 다시 시도하면 기존 페이지를 찾습니다. 중복 페이지는 생성하지 않습니다.",
    ],
    DUPLICATE_REMOTE: [
      "Multiple matching pages exist. Keep one HaptiLog ID in the inbox, then retry.",
      "동일한 HaptiLog ID의 페이지가 여러 개입니다. 인박스에 하나만 남긴 후 다시 시도하세요.",
    ],
    MANAGED_BLOCK_MISSING: [
      "The HaptiLog content block was removed or moved. Restore it before resending; your other notes are preserved.",
      "HaptiLog 내용 블록이 삭제되거나 이동되었습니다. 다시 보내기 전에 복원하세요. 다른 메모는 보존됩니다.",
    ],
    CONTENT_TOO_LARGE: [
      "This recording exceeds the Notion export size limit.",
      "이 기록은 Notion 내보내기 크기 제한을 초과합니다.",
    ],
  };
  return (messages[code] ??
    [
      "Notion is temporarily unavailable. Try again later. Your recording is saved.",
      "Notion에 연결할 수 없습니다. 나중에 다시 시도하세요. 녹음은 안전하게 저장되어 있습니다.",
    ])[ko ? 1 : 0];
}
async function invoke(body: Record<string, unknown>) {
  if (!supabase) throw new Error("NOT_CONFIGURED");
  const { data, error } = await supabase.functions.invoke("notion-export", {
    body,
  });
  if (error) {
    let code = "NOTION_UNAVAILABLE";
    try {
      code = (await error.context.json()).error ?? code;
    } catch { /* Network errors have no JSON response. */ }
    throw new Error(code);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export function NotionExport(
  { records, ko, onAuthorizationReturn, expanded, onExpandedChange }: {
    expanded?: boolean;
    onExpandedChange?: (open: boolean) => void;
    records: Recording[];
    ko: boolean;
    onAuthorizationReturn?: () => void;
  },
) {
  const [status, setStatus] = useState<Status | null>(null);
  const [internalOpen, setInternalOpen] = useState(Boolean(callback));
  const open = expanded ?? internalOpen;
  const setOpen = onExpandedChange ?? setInternalOpen;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState("");
  const alive = useRef(true);
  const running = useRef(false);
  const locale = (en: string, kr: string) => ko ? kr : en;
  useEffect(() => {
    if (callback) {
      onAuthorizationReturn?.();
      onExpandedChange?.(true);
    }
  }, [onAuthorizationReturn, onExpandedChange]);
  useEffect(() => {
    alive.current = true;
    const run = async () => {
      if (callback && !callbackTaken) {
        callbackTaken = true;
        setBusy(true);
        try {
          if (callback.error || !callback.code || !callback.state) {
            throw new Error("OAUTH_EXPIRED");
          }
          await invoke({
            action: "complete",
            code: callback.code,
            state: callback.state,
          });
        } catch (e) {
          if (alive.current) {
            setError(e instanceof Error ? e.message : "NOTION_UNAVAILABLE");
          }
        } finally {
          if (alive.current) setBusy(false);
        }
      }
      try {
        const next = await invoke({ action: "status" });
        if (alive.current) setStatus(next);
      } catch (e) {
        if (alive.current) {
          setError(e instanceof Error ? e.message : "NOTION_UNAVAILABLE");
        }
      }
    };
    void run();
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const ids = new Set(records.map((r) => r.id));
    setSelected((previous) =>
      new Set([...previous].filter((id) => ids.has(id)))
    );
  }, [records]);
  async function operation(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setProgress("");
    try {
      await work();
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "NOTION_UNAVAILABLE");
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function refresh() {
    const next = await invoke({ action: "status" });
    if (alive.current) setStatus(next);
  }
  async function send(ids: string[]) {
    const completed: ExportState[] = [];
    for (const [index, id] of ids.entries()) {
      if (!alive.current) break;
      setProgress(`${index + 1} / ${ids.length}`);
      try {
        const result = await invoke({ action: "export", recording_id: id });
        completed.push(result);
      } catch (e) {
        const code = e instanceof Error ? e.message : "NOTION_UNAVAILABLE";
        completed.push({
          recording_id: id,
          state: "FAILED",
          error_code: code,
          exported_at: null,
        });
        if (
          [
            "ACCESS_REQUIRED",
            "CONNECT_REQUIRED",
            "RECONNECT_REQUIRED",
            "NOTION_PERMISSION",
            "NOTION_RATE_LIMIT",
            "BUSY",
            "NOT_CONFIGURED",
          ].includes(code)
        ) {
          setError(code);
          break;
        }
      }
      if (alive.current) {
        setStatus((previous) =>
          previous
            ? {
              ...previous,
              exports: [
                ...previous.exports.filter((x) =>
                  !completed.some((c) => c.recording_id === x.recording_id)
                ),
                ...completed,
              ],
            }
            : previous
        );
      }
      // One bounded attempt per selected record; retries are always explicit.
      if (index < ids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }
    if (!alive.current) return;
    setStatus((previous) =>
      previous
        ? {
          ...previous,
          exports: [
            ...previous.exports.filter((x) =>
              !completed.some((c) => c.recording_id === x.recording_id)
            ),
            ...completed,
          ],
        }
        : previous
    );
    setProgress(
      locale(
        `${completed.filter((x) => x.state === "EXPORTED").length} sent, ${
          completed.filter((x) => x.state === "FAILED").length
        } failed, ${ids.length - completed.length} not attempted.`,
        `${completed.filter((x) => x.state === "EXPORTED").length}개 전송, ${
          completed.filter((x) => x.state === "FAILED").length
        }개 실패, ${ids.length - completed.length}개 미시도.`,
      ),
    );
  }
  const failed =
    status?.exports.filter((x) =>
      x.state === "FAILED" && records.some((r) => r.id === x.recording_id)
    ).map((x) => x.recording_id) ?? [];
  return (
    <section
      className={`notion-panel${expanded !== undefined && !open ? " notion-panel-collapsed" : ""}`}
      id={expanded !== undefined ? "desktop-notion-export" : undefined}
      aria-label={locale("Notion export", "Notion 내보내기")}
    >
      {expanded === undefined && <button
        className="secondary-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {locale("Notion inbox", "Notion 인박스")}
        {status?.target ? ` · ${status.target.name}` : ""}
      </button>}
      {open && (
        <div className="notion-content">
          <p>
            {locale(
              "Send selected recordings to one Notion inbox. Resending replaces HaptiLog fields and its labeled content block; notes outside that block are kept.",
              "선택한 기록을 Notion 인박스로 보냅니다. 다시 보내면 HaptiLog 속성과 표시된 내용 블록을 갱신하고, 블록 밖의 메모는 보존합니다.",
            )}
          </p>
          <p className="notion-note">
            {locale(
              "Exported pages are external copies. Disconnecting or deleting a recording in HaptiLog does not delete them. Audio stays private in HaptiLog. This connection lasts only while this browser has watch access.",
              "내보낸 페이지는 외부 사본입니다. 연결 해제나 HaptiLog 기록 삭제로 삭제되지 않습니다. 음성은 HaptiLog에 비공개로 보관됩니다. 이 연결은 현재 브라우저의 워치 접근 권한이 유지되는 동안 사용할 수 있습니다.",
            )}
          </p>
          {error && <p role="alert">{notionError(error, ko)}</p>}
          {progress && <p role="status" aria-live="polite">{progress}</p>}
          {!status
            ? (
              <button
                disabled={busy}
                className="secondary-button"
                onClick={() => void operation(refresh)}
              >
                {locale("Check connection", "연결 확인")}
              </button>
            )
            : !status.configured
            ? <p>{notionError("NOT_CONFIGURED", ko)}</p>
            : (
              <>
                <div className="notion-actions">
                  <button
                    disabled={busy}
                    className="secondary-button"
                    onClick={() =>
                      void operation(async () => {
                        const data = await invoke({ action: "authorize" });
                        const url = new URL(data.url);
                        if (
                          url.origin !== "https://api.notion.com"
                        ) throw new Error("NOTION_UNAVAILABLE");
                        window.location.assign(url.href);
                      })}
                  >
                    {status.connected
                      ? locale("Reconnect Notion", "Notion 다시 연결")
                      : locale("Connect Notion", "Notion 연결")}
                  </button>
                  {status.connected && (
                    <>
                      <span>{status.workspace}</span>
                      <button
                        disabled={busy}
                        className="secondary-button"
                        onClick={() =>
                          void operation(async () => {
                            const data = await invoke({ action: "targets" });
                            setTargets(data.targets);
                            setCursor(data.cursor);
                            setChoosing(true);
                          })}
                      >
                        {locale("Choose inbox", "인박스 선택")}
                      </button>
                      <button
                        disabled={busy}
                        className="secondary-button"
                        onClick={() =>
                          void operation(async () => {
                            await invoke({ action: "disconnect" });
                            setTargets([]);
                            setChoosing(false);
                            setSelected(new Set());
                            await refresh();
                          })}
                      >
                        {locale("Disconnect Notion", "Notion 연결 해제")}
                      </button>
                    </>
                  )}
                </div>
                {choosing && (
                  <div className="notion-target">
                    <p>
                      {locale(
                        "Create a table named HaptiLog inbox in Notion and share it during authorization. Selecting it adds missing HaptiLog fields; existing incompatible fields are preserved and reported.",
                        "Notion에 HaptiLog 인박스 표를 만들고 인증할 때 공유하세요. 인박스를 선택하면 필요한 속성을 추가합니다. 기존 속성 형식이 다르면 변경하지 않고 안내합니다.",
                      )}
                    </p>
                    <label>
                      {locale("Inbox", "인박스")}{" "}
                      <select
                        value={target}
                        disabled={busy}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">
                          {locale("Select a table", "표 선택")}
                        </option>
                        {targets.map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="secondary-button"
                      disabled={busy || !target}
                      onClick={() =>
                        void operation(async () => {
                          await invoke({ action: "target", id: target });
                          setChoosing(false);
                          await refresh();
                        })}
                    >
                      {locale("Use this inbox", "이 인박스 사용")}
                    </button>
                    {cursor && (
                      <button
                        disabled={busy}
                        className="secondary-button"
                        onClick={() =>
                          void operation(async () => {
                            const data = await invoke({
                              action: "targets",
                              cursor,
                            });
                            setTargets(
                              (previous) => [
                                ...previous,
                                ...data.targets.filter((x: Target) =>
                                  !previous.some((p) => p.id === x.id)
                                ),
                              ],
                            );
                            setCursor(data.cursor);
                          })}
                      >
                        {locale("Load more", "더 보기")}
                      </button>
                    )}
                    {!targets.length && (
                      <p>
                        {locale(
                          "No shared tables found. Reconnect and include your inbox in the page picker.",
                          "공유된 표가 없습니다. 다시 연결하고 인박스를 공유 대상으로 선택하세요.",
                        )}
                      </p>
                    )}
                  </div>
                )}
                {status.connected && status.target && (
                  <>
                    <div className="notion-actions">
                      <button
                        disabled={busy || !records.length}
                        className="secondary-button"
                        onClick={() =>
                          setSelected(new Set(records.map((r) => r.id)))}
                      >
                        {locale("Select visible", "현재 목록 선택")}
                      </button>
                      <button
                        disabled={busy || !selected.size}
                        className="secondary-button"
                        onClick={() => setSelected(new Set())}
                      >
                        {locale("Clear selection", "선택 해제")}
                      </button>
                      <button
                        disabled={busy || !selected.size}
                        className="primary-button"
                        onClick={() =>
                          void operation(() => send([...selected]))}
                      >
                        {locale(
                          `Send to Notion (${selected.size})`,
                          `Notion으로 보내기 (${selected.size})`,
                        )}
                      </button>
                      <button
                        disabled={busy || !failed.length}
                        className="secondary-button"
                        onClick={() => void operation(() => send(failed))}
                      >
                        {locale(
                          `Retry failed (${failed.length})`,
                          `실패 항목 재시도 (${failed.length})`,
                        )}
                      </button>
                    </div>
                    <div className="notion-records">
                      {records.map((r) => {
                        const delivery = status.exports.find((x) =>
                          x.recording_id === r.id
                        );
                        return (
                          <div className="notion-record" key={r.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selected.has(r.id)}
                                disabled={busy}
                                onChange={(e) =>
                                  setSelected((previous) => {
                                    const next = new Set(previous);
                                    if (e.target.checked) next.add(r.id);
                                    else next.delete(r.id);
                                    return next;
                                  })}
                              />
                              <span>
                                {latest(r)?.summary ||
                                  new Date(r.recorded_at).toLocaleString()}
                              </span>
                            </label>
                            <small>
                              {delivery?.state === "EXPORTED"
                                ? locale("Sent", "전송됨")
                                : delivery?.state === "FAILED"
                                ? notionError(delivery.error_code ?? "", ko)
                                : locale("Not sent", "미전송")}
                              {delivery?.exported_at
                                ? ` · ${
                                  new Date(delivery.exported_at)
                                    .toLocaleString()
                                }`
                                : ""}
                            </small>
                          </div>
                        );
                      })}
                      {!records.length && (
                        <p>
                          {locale(
                            "No recordings in the current view.",
                            "현재 목록에 기록이 없습니다.",
                          )}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
        </div>
      )}
    </section>
  );
}
