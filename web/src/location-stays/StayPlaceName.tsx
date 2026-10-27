import { useEffect, useRef, useState } from 'react';
import type { JournalItem } from '../journal.ts';
import { placeCandidates } from '../journal.ts';
import { LocationError, parseSnapshot } from './repository.ts';
import type { SavedPlace } from './types.ts';
import type { LocationJournal } from './useLocationJournal.ts';
import './stays.css';

/** Name a captured place in context. Coordinates and radius need no extra user input. */
export function StayPlaceName({ item, journal, lang, compact = false }: {
  item: Extract<JournalItem, { kind: 'stay' }>; journal: LocationJournal; lang: 'ko' | 'en'; compact?: boolean;
}) {
  const ko = lang === 'ko';
  const candidates = placeCandidates(item), known = candidates.length === 1 ? candidates[0] : null;
  const [editing, setEditing] = useState(false), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const [target, setTarget] = useState<SavedPlace | null>(null), [id, setId] = useState(''), [revision, setRevision] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) input.current?.focus();
    else if (wasEditing.current) trigger.current?.focus({ preventScroll: true });
    wasEditing.current = editing;
  }, [editing]);
  const allowed = !!journal.repository && !!journal.snapshot?.state.consent_enabled;
  const open = () => {
    setTarget(known); setId(known?.id ?? crypto.randomUUID()); setRevision(journal.snapshot!.state.places_revision);
    setName(known?.name ?? ''); setError(''); setMessage(''); setConflict(false); setEditing(true);
  };
  const reload = async () => {
    setBusy(true);
    try {
      const next = await journal.load();
      if (!next) throw new Error('refresh');
      const current = next.places.find(place => place.id === id) ?? null;
      if (target && !current) { setError(ko ? '이 장소가 삭제됐습니다. 이름을 복사한 뒤 취소하고 다시 시작해 주세요.' : 'This place was deleted. Copy your name, cancel and start again.'); return; }
      setTarget(current); setRevision(next.state.places_revision); setConflict(false); setError('');
      setMessage(current ? (ko ? `현재 이름: ${current.name}. 변경 내용을 확인한 뒤 저장하세요.` : `Current name: ${current.name}. Review your change before saving.`) : (ko ? '최신 장소를 불러왔습니다. 이름을 확인한 뒤 저장하세요.' : 'Places refreshed. Review the name before saving.'));
    } catch { setError(ko ? '새로고침하지 못했습니다. 입력한 이름은 유지됩니다.' : 'Could not refresh. Your name is preserved.'); }
    finally { setBusy(false); }
  };
  if (!allowed) return null;
  return <div className={`stay-place-name${editing ? ' is-editing' : ''}`}>
    {!editing ? <>
      <button ref={trigger} type="button" className={compact ? 'ribbon-place-save' : 'secondary-button'} onClick={open}>{known ? (ko ? '이름 수정' : 'Rename place') : compact ? (ko ? '＋ 장소로 저장' : '+ Save place') : (ko ? '장소로 저장' : 'Save as a place')}</button>
      {message && <p role="status" className={compact ? 'sr-only' : undefined}>{message}</p>}
    </> : <form aria-label={ko ? '장소 이름 정하기' : 'Name this place'} onSubmit={async event => {
      event.preventDefault();
      if (busy || conflict || !name.trim() || name.trim().length > 40) return;
      const snapshot = journal.snapshot!;
      if (!target && snapshot.places.length >= 20) { setError(ko ? '내 장소는 최대 20개까지 저장할 수 있습니다.' : 'You can save at most 20 places.'); return; }
      setBusy(true); setError(''); setMessage('');
      try {
        const place = { id, name: name.trim(),
          latitude: target?.latitude ?? item.stay.representative_latitude,
          longitude: target?.longitude ?? item.stay.representative_longitude,
          radius_meters: target?.radius_meters ?? 200,
        };
        await journal.mutate(async () => {
          const result = await journal.repository!.putPlace(place, revision);
          // Retain the acknowledged name even if the following snapshot refresh fails.
          journal.replace(parseSnapshot({ ...snapshot, state: result.state, places: [
            ...snapshot.places.filter(existing => existing.id !== id),
            { ...place, revision: (result.state as Record<string, unknown>)?.places_revision },
          ] }));
        });
        setEditing(false); setMessage(ko ? '내 장소에 저장했습니다.' : 'Saved to your places.');
      } catch (e) {
        const code = e instanceof LocationError ? e.code : 'NETWORK';
        setConflict(code === 'REVISION_CONFLICT');
        setError(code === 'REVISION_CONFLICT' ? (ko ? '장소 정보가 바뀌었습니다. 입력한 이름은 유지됩니다. 최신 정보를 확인해 주세요.' : 'Places changed. Your name is preserved. Refresh to review the latest information.') : (ko ? '저장하지 못했습니다. 입력한 이름을 확인하고 다시 시도해 주세요.' : 'Could not save. Your name is preserved; please retry.'));
      } finally { setBusy(false); }
    }}>
      <label>{ko ? '장소 이름' : 'Place name'}<input ref={input} value={name} onChange={event => setName(event.target.value)} maxLength={40} required disabled={busy} placeholder={ko ? '집, 회사, 자주 가는 카페' : 'Home, work, favorite café'} /></label>
      <div className="stay-name-actions"><button type="submit" className="primary-button" disabled={busy || conflict || !name.trim()}>{busy ? (ko ? '저장 중…' : 'Saving…') : (ko ? '저장' : 'Save')}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing(false); setError(''); setMessage(''); }}>{ko ? '취소' : 'Cancel'}</button></div>
      {error && <p role="alert">{error}</p>}
      {conflict && <button type="button" className="text-button" disabled={busy} onClick={() => void reload()}>{ko ? '최신 정보 확인' : 'Review latest places'}</button>}
      {message && <p role="status">{message}</p>}
    </form>}
  </div>;
}
