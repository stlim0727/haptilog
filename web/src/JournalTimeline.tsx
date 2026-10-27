import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { JournalItem } from './journal.ts';
import { journalDuration, journalTitle } from './journal.ts';
import { ribbonColor } from './ribbonGroups.ts';
import { ribbonLayout } from './ribbons.ts';
import './ribbons.css';

/** Shared list geometry keeps voice chronology and gives stays a continuous time range. */
export function JournalTimeline({ items, allItems, now, lang, renderVoice, onSelectStay, renderPlaceName, dayGrouped = false }: {
  items: JournalItem[]; allItems: JournalItem[]; now: number; lang: 'ko' | 'en'; dayGrouped?: boolean;
  renderVoice: (item: JournalItem) => ReactNode;
  onSelectStay: (item: Extract<JournalItem, { kind: 'stay' }>) => void;
  renderPlaceName?: (item: Extract<JournalItem, { kind: 'stay' }>, compact?: boolean, identity?: string) => ReactNode;
}) {
  const { rows, ranges, lanes, groups } = ribbonLayout(items, allItems, now);
  const identity = (item: JournalItem) => item.kind === 'stay' ? groups.get(item.id)!.key : item.id;
  const ko = lang === 'ko';
  const time = (value: string) => new Date(value).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const showDate = !dayGrouped && new Set(items.map(item => new Date(item.recorded_at).toLocaleDateString())).size > 1;
  const range = (from: string, to: string, dated = false) => {
    const a = new Date(from), b = new Date(to);
    const day = (value: string) => { const date = new Date(value); return `${date.getMonth() + 1}/${date.getDate()}`; };
    if (a.toLocaleDateString() === b.toLocaleDateString()) return `${dated ? day(from) + ' ' : ''}${time(from)}–${time(to)}`;
    return `${day(from)} ${time(from)}–${day(to)} ${time(to)}`;
  };
  const minutes = (item: Extract<JournalItem, { kind: 'stay' }>) => {
    const count = Math.floor(item.stay.observed_duration_millis / 60_000);
    return ko ? `관측 ${count}분` : `${count}m observed`;
  };
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const expand = (id: string, open: boolean) => setExpanded(previous => {
    if (previous.has(id) === open) return previous;
    const next = new Set(previous); if (open) next.add(id); else next.delete(id); return next;
  });
  const select = (item: Extract<JournalItem, { kind: 'stay' }>) => {
    if (groups.get(item.id)!.members.length > 1) expand(identity(item), !expanded.has(identity(item)));
    else onSelectStay(item);
  };
  return <div className="journal-ribbons" style={{ gridTemplateColumns: `repeat(${lanes}, 10px) minmax(0, 1fr)` }}>
    {ranges.flatMap(({ item, lane, segments }) => segments.map(({ first, last }) => <button key={`ribbon:${item.id}:${first}`} type="button" className="stay-ribbon" style={{ color: ribbonColor(item), gridColumn: lane + 1, gridRow: `${first + 1} / ${last + 2}` }} onClick={() => select(item)} aria-expanded={groups.get(item.id)!.members.length > 1 ? expanded.has(identity(item)) : undefined} aria-label={`${journalTitle(item, lang)} · ${journalDuration(groups.get(item.id)!.summary, lang)}`} />))}
    {rows.map((item, index) => <div key={`${item.kind}:${identity(item)}`} className={item.kind === 'stay' ? `ribbon-stay-row${expanded.has(identity(item)) ? ' is-expanded' : ''}` : 'ribbon-voice-row'} style={{ gridColumn: lanes + 1, gridRow: index + 1 }}>
      {item.kind === 'voice' ? renderVoice(item) : <div className="ribbon-stay-label">
        <button type="button" className="ribbon-stay-open" data-record-id={item.id} data-journal-kind="stay" onClick={() => select(item)} aria-expanded={groups.get(item.id)!.members.length > 1 ? expanded.has(identity(item)) : undefined}>
          <span className="ribbon-stay-title"><strong>{journalTitle(item, lang)}</strong>{groups.get(item.id)!.members.length > 1 && <ChevronDown size={12} aria-hidden="true" className={expanded.has(identity(item)) ? "expanded" : ""} />}</span>
          <span className="ribbon-stay-time">{range(groups.get(item.id)!.summary.stay.started_at, item.stay.last_observed_at, showDate)} · {minutes(groups.get(item.id)!.summary)}</span>
        </button>
        {renderPlaceName?.(item, true, identity(item))}
        {groups.get(item.id)!.members.length > 1 && expanded.has(identity(item)) && <div className="ribbon-group-sources" role="group" aria-label={ko ? '원본 체류' : 'Original stays'}>
          {groups.get(item.id)!.members.map(member => <button key={member.id} type="button" data-record-id={member.id} onClick={() => onSelectStay(member)}>{range(member.stay.started_at, member.stay.last_observed_at)} · {minutes(member)}</button>)}
        </div>}
      </div>}
    </div>)}
  </div>;
}
