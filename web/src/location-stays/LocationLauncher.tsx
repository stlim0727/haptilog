import { useEffect, useMemo, useRef, useState } from "react";
import type { Recording } from "../domain.ts";
import { supabase } from "../client.ts";
import { createLocationRepository } from "./repository.ts";
import { LocationWorkspace } from "./LocationWorkspace.tsx";

export default function LocationLauncher({ owner, sessionId, records, lang, isDemo = false }: {
  owner: string; sessionId: string; records: Recording[]; lang: "ko" | "en"; isDemo?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const repository = useMemo(() => supabase ? createLocationRepository(owner, (name, args) => supabase!.rpc(name, args)) : null, [owner, sessionId]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} className="secondary-button" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>{lang === "ko" ? "체류와 내 장소" : "Stays and my places"}</button>
    <dialog ref={dialog} className="location-dialog" aria-label={lang === "ko" ? "체류와 내 장소" : "Stays and my places"} onCancel={event => { event.preventDefault(); close(); }}>
      <button type="button" onClick={close}>{lang === "ko" ? "닫기" : "Close"}</button>
      {open && (isDemo ? <p>{lang === "ko" ? "샘플 모드에서는 위치 동기화를 사용하지 않습니다. 실제 워치를 연결하면 장소 기능을 확인할 수 있습니다." : "Location synchronization is unavailable in sample mode. Connect a watch to use places."}</p> : repository ?
        <LocationWorkspace key={`${owner}:${sessionId}`} owner={owner} repository={repository} records={records} lang={lang} /> :
        <p>{lang === "ko" ? "서버 연결을 사용할 수 없습니다. 음성 목록으로 돌아갈 수 있습니다." : "Server connection unavailable. You can return to your voice recordings."}</p>)}
    </dialog>
  </>;
}
