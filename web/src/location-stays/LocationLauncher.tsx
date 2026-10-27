import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { LocationWorkspace } from './LocationWorkspace.tsx';
import type { LocationJournal } from './useLocationJournal.ts';

export default function LocationLauncher({ journal, lang, isDemo = false }: {
  journal: LocationJournal; lang: 'ko' | 'en'; isDemo?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = () => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    if (!dialog.current?.open) dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  return <>
    <button ref={trigger} className="secondary-button" type="button" aria-haspopup="dialog" onClick={open}>
      {lang === 'ko' ? '장소 설정' : 'Place settings'}
    </button>
    {createPortal(<dialog ref={dialog} className="location-dialog" aria-label={lang === 'ko' ? '장소 설정' : 'Place settings'}
      onCancel={event => { event.preventDefault(); close(); }}
      onClose={() => {
        const target = returnFocus.current?.isConnected ? returnFocus.current : trigger.current;
        target?.focus();
      }}>
      <button type="button" onClick={close}>{lang === 'ko' ? '닫기' : 'Close'}</button>
      {isDemo
        ? <p>{lang === 'ko' ? '샘플 모드에서는 위치 동기화를 사용하지 않습니다. 실제 워치를 연결해 주세요.' : 'Location synchronization is unavailable in sample mode. Connect a watch to use places.'}</p>
        : journal.repository && journal.owner
          ? <LocationWorkspace owner={journal.owner} repository={journal.repository} journal={journal} lang={lang} />
          : <p>{lang === 'ko' ? '서버 연결을 사용할 수 없습니다.' : 'Server connection unavailable.'}</p>}
    </dialog>, document.body)}
  </>;
}
