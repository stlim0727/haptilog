import type { ReactNode } from 'react';
import type { JournalItem } from './journal.ts';
import { journalDuration, journalTitle, placeCandidates } from './journal.ts';
import { ribbonLayout } from './ribbons.ts';
import './ribbons.css';

/** Shared list geometry keeps voice chronology and gives stays a continuous time range. */
export function JournalTimeline({ items, allItems, now, lang, renderVoice, onSelectStay, onSavePlace }: {
  items: JournalItem[]; allItems: JournalItem[]; now: number; lang: 'ko' | 'en';
  renderVoice: (item: JournalItem) => ReactNode;
  onSelectStay: (item: Extract<JournalItem, { kind: 'stay' }>) => void;
  onSavePlace?: (item: Extract<JournalItem, { kind: 'stay' }>) => void;
}) {
  const { rows, ranges, lanes } = ribbonLayout(items, allItems, now);
  const ko = lang === 'ko';
  return <div className="journal-ribbons" style={{ gridTemplateColumns: `repeat(${lanes}, 8px) minmax(0, 1fr)` }}>
    {ranges.flatMap(({ item, lane, segments }) => segments.map(({ first, last }) => <button key={`ribbon:${item.id}:${first}`} type="button" className="stay-ribbon" style={{ gridColumn: lane + 1, gridRow: `${first + 1} / ${last + 2}` }} onClick={() => onSelectStay(item)} aria-label={`${journalTitle(item, lang)} · ${journalDuration(item, lang)}`} />))}
    {rows.map((item, index) => <div key={`${item.kind}:${item.id}`} className={item.kind === 'stay' ? 'ribbon-stay-row' : 'ribbon-voice-row'} style={{ gridColumn: lanes + 1, gridRow: index + 1 }}>
      {item.kind === 'voice' ? renderVoice(item) : <div className="ribbon-stay-label">
        <button type="button" className="ribbon-stay-open" data-record-id={item.id} data-journal-kind="stay" onClick={() => onSelectStay(item)}>
          <strong>{journalTitle(item, lang)}</strong>
          <span>{new Date(item.stay.started_at).toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – {new Date(item.stay.last_observed_at).toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {journalDuration(item, lang)}</span>
        </button>
        {placeCandidates(item).length !== 1 && onSavePlace && <button type="button" className="ribbon-place-save" onClick={() => onSavePlace(item)}>{ko ? '＋ 장소로 저장' : '+ Save place'}</button>}
      </div>}
    </div>)}
  </div>;
}
