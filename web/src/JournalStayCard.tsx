import { ChevronRight, MapPin } from 'lucide-react';
import { journalDates, journalDuration, journalTitle, placeCandidates } from './journal.ts';
import type { JournalItem } from './journal.ts';
import { presence } from './location-stays/domain.ts';

/** Uses the same card and selection grammar as voice entries. */
export function JournalStayCard({ item, lang, mobile = false, selected = false, now, onSelect }: {
  item: Extract<JournalItem, { kind: 'stay' }>;
  lang: 'ko' | 'en'; mobile?: boolean; selected?: boolean; now: number; onSelect: () => void;
}) {
  const ko = lang === 'ko';
  const crossesDate = journalDates(item).length > 1;
  const last = new Date(item.stay.last_observed_at).toLocaleString(lang, crossesDate
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });
  const start = new Date(item.recorded_at).toLocaleString(lang, mobile && !crossesDate
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const status = presence(item.stay, now);
  const statusText = status === 'active' ? (ko ? '최근 확인됨' : 'Recently confirmed')
    : status === 'stale' ? (ko ? '최근 위치 확인 안 됨' : 'Awaiting fresh location')
    : (ko ? '체류 종료' : 'Ended');
  return <button type="button" className={mobile ? 'mobile-record' : `record-card ${selected ? 'selected' : ''}`}
    data-record-id={item.id} data-journal-kind="stay" onClick={onSelect}>
    <span className={mobile ? 'mobile-record-meta' : 'record-meta'}>
      <time>{start} – {last}</time>
      <span className="category category-stay"><MapPin size={12} />{ko ? '체류' : 'Stay'}</span>
    </span>
    <strong>{journalTitle(item, lang)}</strong>
    {placeCandidates(item).length === 1 && <span className="stay-card-context">{ko ? '현재 장소 설정 기준' : 'Based on current place settings'}</span>}
    <span className={mobile ? 'mobile-record-foot' : 'record-bottom'}>
      <span>{journalDuration(item, lang)}</span><span>{statusText}</span><ChevronRight size={14} />
    </span>
  </button>;
}
