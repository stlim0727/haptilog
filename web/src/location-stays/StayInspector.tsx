import { Component, useState, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Clock, MapPin, Trash2 } from 'lucide-react';
import { journalDuration, journalTitle, placeCandidates } from '../journal.ts';
import type { JournalItem } from '../journal.ts';
import { presence } from './domain.ts';
import { clearDismissals } from './dismissals.ts';
import { LocationError } from './repository.ts';
import type { LocationJournal } from './useLocationJournal.ts';
const RecordingMap = lazy(() => import('../RecordingMap'));
class StayMapBoundary extends Component<{ children: ReactNode; ko: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="status">{this.props.ko ? '지도를 불러오지 못했습니다. 체류 상세는 계속 확인할 수 있습니다.' : 'Map unavailable. Stay details remain available.'}</p>
      : this.props.children;
  }
}
export function StayInspector({ item, journal, lang, onSavePlace }: { item: Extract<JournalItem, { kind: 'stay' }>; journal: LocationJournal; lang: 'ko' | 'en'; onSavePlace: () => void }) {
  const ko = lang === 'ko', stay = item.stay;
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const status = presence(stay, journal.now);
  const time = (value: string) => new Date(value).toLocaleString(ko ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  async function remove() {
    if (!journal.repository || !journal.snapshot) return;
    setBusy(true); setError('');
    try {
      const snapshot = journal.snapshot;
      await journal.mutate(async () => {
        await journal.repository!.deleteStays([stay.id], snapshot.state.sync_epoch);
        journal.replace({ ...snapshot, stays: snapshot.stays.filter(s => s.id !== stay.id), deleted_ids: [...snapshot.deleted_ids, stay.id] });
      });
      if (journal.owner) clearDismissals(localStorage, journal.owner);
      setConfirm(false);
    } catch (e) { setError(e instanceof LocationError && e.code === 'EPOCH_CONFLICT' ? (ko ? '기록이 변경됐습니다. 새로고침 후 다시 시도하세요.' : 'Journal changed. Refresh and try again.') : (ko ? '삭제하지 못했습니다. 연결을 확인하고 다시 시도하세요.' : 'Could not delete. Check your connection and retry.')); }
    finally { setBusy(false); }
  }
  return <article className="stay-inspector" data-journal-kind="stay">
    <span className="eyebrow"><MapPin size={14} /> {ko ? '체류' : 'Stay'}</span>
    <h2>{journalTitle(item, lang)}</h2>
    {placeCandidates(item).length === 1 && <p className="location-secondary">{ko ? '현재 장소 설정 기준 · 과거 장소 확정 아님' : 'Based on current place settings · historical place not confirmed'}</p>}
    <p className="stay-duration"><Clock size={18} /> {journalDuration(item, lang)}</p>
    <p className="location-secondary">{status === 'active' ? (ko ? '최근 위치 확인됨' : 'Location recently confirmed') : status === 'stale' ? (ko ? '최근 위치 확인 안 됨' : 'Awaiting fresh location') : (ko ? '체류 종료' : 'Stay ended')}</p>
    <dl className="stay-observations"><div><dt>{ko ? '관측 시작' : 'First observed'}</dt><dd>{time(stay.started_at)}</dd></div><div><dt>{ko ? '마지막 확인' : 'Last confirmed'}</dt><dd>{time(stay.last_observed_at)}</dd></div><div><dt>{ko ? '위치 정확도' : 'Location accuracy'}</dt><dd>±{Math.round(stay.accuracy_meters)} m</dd></div></dl>
    <p className="location-secondary">{ko ? '위치가 확인된 시간만 표시합니다. 관측이 끊긴 시간은 포함하지 않습니다. 체류는 시작 후 7일간 보관됩니다.' : 'Only observed time is counted. Gaps are not added. Stays are kept for seven days from their start.'}</p>
    <StayMapBoundary ko={ko}><Suspense fallback={<p>{ko ? '지도 불러오는 중…' : 'Loading map…'}</p>}><RecordingMap recordings={[]} journalItems={[item]} selectedId={item.id} onSelect={() => {}} showRoute={false} showSelectionSummary={false} lang={lang} /></Suspense></StayMapBoundary>
    <div className="stay-actions"><button className="secondary-button" disabled={busy || !journal.snapshot?.state.consent_enabled} onClick={onSavePlace}><MapPin size={16} />{ko ? '장소로 저장' : 'Save as a place'}</button><button className="secondary-button" disabled={busy} onClick={() => setConfirm(true)}><Trash2 size={16} />{ko ? '이 체류 삭제' : 'Delete this stay'}</button></div>
    {error && <p role="alert">{error}</p>}
    {confirm && <section className="stay-delete-confirm" aria-label={ko ? '체류 삭제 확인' : 'Confirm stay deletion'}><p>{ko ? '이 체류를 영구 삭제할까요? 다시 동기화해도 복원되지 않습니다. 음성과 내 장소는 유지됩니다.' : 'Permanently delete this stay? Synchronization will not restore it. Voice recordings and saved places are retained.'}</p><button className="secondary-button" disabled={busy} onClick={() => void remove()}>{ko ? '체류 영구 삭제' : 'Permanently delete stay'}</button><button className="secondary-button" disabled={busy} onClick={() => setConfirm(false)}>{ko ? '취소' : 'Cancel'}</button></section>}
  </article>;
}
