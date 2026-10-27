import { useRef, type ReactNode } from 'react';
import { MapPin, MoreHorizontal, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { LocationWorkspace } from './LocationWorkspace.tsx';
import type { LocationJournal } from './useLocationJournal.ts';

export default function LocationLauncher({ journal, lang, isDemo = false, beforeOpen, moreActions }: {
  journal: LocationJournal; lang: 'ko' | 'en'; isDemo?: boolean; beforeOpen?: () => HTMLElement | null; moreActions?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = () => {
    returnFocus.current = beforeOpen ? beforeOpen() : moreTrigger.current;
    menu.current?.close();
    if (!dialog.current?.open) dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  return <>
    {beforeOpen ? <button ref={trigger} className="mobile-places-entry" type="button" aria-haspopup="dialog" onClick={open}>
      <MapPin size={18} />{lang === 'ko' ? '내 장소' : 'My places'}
    </button> : <>
      <button ref={moreTrigger} className="secondary-button" type="button" aria-label={lang === 'ko' ? '더보기' : 'More options'} aria-haspopup="dialog" onClick={() => menu.current?.showModal()}><MoreHorizontal size={18} /></button>
      {createPortal(<dialog ref={menu} className="journal-more-dialog" aria-label={lang === 'ko' ? '더보기' : 'More options'} onClose={() => { if (!dialog.current?.open) moreTrigger.current?.focus(); }}>
        <div className="place-settings-heading"><h2>{lang === 'ko' ? '더보기' : 'More options'}</h2><button className="secondary-button" type="button" aria-label={lang === 'ko' ? '닫기' : 'Close'} onClick={() => menu.current?.close()}><X size={18} /></button></div>
        <button className="secondary-button" type="button" aria-haspopup="dialog" onClick={open}><MapPin size={18} />{lang === 'ko' ? '내 장소' : 'My places'}</button>
        <div className="journal-more-actions" onClick={event => { if ((event.target as HTMLElement).closest('button:not(:disabled)')) menu.current?.close(); }}>{moreActions}</div>
      </dialog>, document.body)}
    </>}
    {createPortal(<dialog ref={dialog} className="location-dialog" aria-label={lang === 'ko' ? '내 장소' : 'My places'}
      onCancel={event => { event.preventDefault(); close(); }}
      onClose={() => {
        const target = returnFocus.current?.isConnected ? returnFocus.current : trigger.current;
        target?.focus();
      }}>
      <div className="place-settings-heading"><h2>{lang === 'ko' ? '내 장소' : 'My places'}</h2><button className="secondary-button" type="button" aria-label={lang === 'ko' ? '닫기' : 'Close'} onClick={close}><X size={18} /></button></div>
      {isDemo
        ? <p>{lang === 'ko' ? '샘플 모드에서는 위치 동기화를 사용하지 않습니다. 실제 워치를 연결해 주세요.' : 'Location synchronization is unavailable in sample mode. Connect a watch to use places.'}</p>
        : journal.repository && journal.owner
          ? <LocationWorkspace owner={journal.owner} repository={journal.repository} journal={journal} lang={lang} />
          : <p>{lang === 'ko' ? '서버 연결을 사용할 수 없습니다.' : 'Server connection unavailable.'}</p>}
    </dialog>, document.body)}
  </>;
}
