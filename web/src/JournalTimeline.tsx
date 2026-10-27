import { useState } from 'react';
import type { ReactNode } from 'react';
import type { JournalItem } from './journal.ts';
import { journalDuration, journalTitle, placeCandidates } from './journal.ts';
import { ribbonColor } from './ribbonGroups.ts';
import { ribbonLayout } from './ribbons.ts';
import './ribbons.css';

/** Shared list geometry keeps voice chronology and gives stays a continuous time range. */
export function JournalTimeline({ items, allItems, now, lang, renderVoice, onSelectStay, onSavePlace }: {
  items: JournalItem[]; allItems: JournalItem[]; now: number; lang: 'ko' | 'en';
  renderVoice: (item: JournalItem) => ReactNode;
  onSelectStay: (item: Extract<JournalItem, { kind: 'stay' }>) => void;
  onSavePlace?: (item: Extract<JournalItem, { kind: 'stay' }>) => void;
}) {
  const { rows, ranges, lanes, groups } = ribbonLayout(items, allItems, now);
  const ko = lang === 'ko';
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const expand = (id: string, open: boolean) => setExpanded(previous => {
    if (previous.has(id) === open) return previous;
    const next = new Set(previous); if (open) next.add(id); else next.delete(id); return next;
  });
  const select = (item: Extract<JournalItem, { kind: 'stay' }>) => {
    if (groups.get(item.id)!.members.length > 1) expand(item.id, !expanded.has(item.id));
    else onSelectStay(item);
  };
  return <div className="journal-ribbons" style={{ gridTemplateColumns: `repeat(${lanes}, 8px) minmax(0, 1fr)` }}>
    {ranges.flatMap(({ item, lane, segments }) => segments.map(({ first, last }) => <button key={`ribbon:${item.id}:${first}`} type="button" className="stay-ribbon" style={{ background: ribbonColor(item), gridColumn: lane + 1, gridRow: `${first + 1} / ${last + 2}` }} onClick={() => select(item)} aria-expanded={groups.get(item.id)!.members.length > 1 ? expanded.has(item.id) : undefined} aria-label={`${journalTitle(item, lang)} · ${journalDuration(groups.get(item.id)!.summary, lang)}`} />))}
    {rows.map((item, index) => <div key={`${item.kind}:${item.id}`} className={item.kind === 'stay' ? 'ribbon-stay-row' : 'ribbon-voice-row'} style={{ gridColumn: lanes + 1, gridRow: index + 1 }}>
      {item.kind === 'voice' ? renderVoice(item) : <div className="ribbon-stay-label">
        <button type="button" className="ribbon-stay-open" data-record-id={item.id} data-journal-kind="stay" onClick={() => select(item)} aria-expanded={groups.get(item.id)!.members.length > 1 ? expanded.has(item.id) : undefined}>
          <strong>{journalTitle(item, lang)}</strong>
          <span>{new Date(groups.get(item.id)!.summary.stay.started_at).toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – {new Date(item.stay.last_observed_at).toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {journalDuration(groups.get(item.id)!.summary, lang)}</span>
        </button>
        {placeCandidates(item).length !== 1 && onSavePlace && <button type="button" className="ribbon-place-save" onClick={() => onSavePlace(item)}>{ko ? '＋ 장소로 저장' : '+ Save place'}</button>}
        {groups.get(item.id)!.members.length > 1 && <details className="ribbon-group-sources" open={expanded.has(item.id)} onToggle={event => expand(item.id, event.currentTarget.open)}>
          <summary>{ko ? `${groups.get(item.id)!.members.length}개 체류 묶음` : `${groups.get(item.id)!.members.length} stays grouped`}</summary>
          <p>{ko ? '3분 이내 공백으로 이어진 같은 장소입니다. 공백은 확인된 시간에 포함하지 않습니다.' : 'Same place with gaps up to 3 minutes. Gaps are excluded from observed time.'}</p>
          {groups.get(item.id)!.members.map(member => <button key={member.id} type="button" data-record-id={member.id} onClick={() => onSelectStay(member)}>{new Date(member.stay.started_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })} – {new Date(member.stay.last_observed_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })} · {journalDuration(member, lang)}</button>)}
        </details>}
      </div>}
    </div>)}
  </div>;
}
