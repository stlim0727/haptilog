import { useEffect, useMemo, useRef, useState } from 'react';
import type { Stay } from '../location-stays/types';
import type { RawSample } from './domain';
import { hourlyBins, recentDays, timelineDots, type TimeBin, type TimeRange } from './timeline';
type Indices = [number, number];
function DotRail({ bins, samples, value, onChange, aggregate, ko, stays }: {
  stays: Stay[];
  bins: TimeBin[]; samples: RawSample[]; value: Indices; onChange: (value: Indices) => void; aggregate: boolean; ko: boolean;
}) {
  const anchor = useRef<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const dots = useMemo(() => timelineDots(samples, bins, aggregate), [samples, bins, aggregate]);
  const firstDot = dots[0]?.x;
  useEffect(() => {
    const el = viewport.current;
    if (!el || anchor.current !== null) return;
    const left = value[0] / bins.length * el.scrollWidth;
    const right = (value[1] + 1) / bins.length * el.scrollWidth;
    if (right - left > el.clientWidth) {
      el.scrollLeft = firstDot === undefined ? left : Math.max(left, firstDot / 100 * el.scrollWidth - el.clientWidth / 3);
    } else if (left < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = (left + right - el.clientWidth) / 2;
    }
  }, [value[0], value[1], bins[0]?.start, bins.at(-1)?.end, firstDot]);
  const name = aggregate ? (ko ? '일별' : 'Daily') : (ko ? '시간별' : 'Hourly');
  const indexAt = (x: number, element: SVGSVGElement) => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.min(bins.length - 1, Math.floor((x - rect.left) / rect.width * bins.length)));
  };
  return <fieldset className="raw-timeline-level">
    <legend>{aggregate ? (ko ? '1 · 일별' : '1 · Days') : (ko ? '2 · 시간별' : '2 · Hours')}</legend>
    <div className="raw-dot-scroll" ref={viewport}>
      <div className="raw-dot-content" style={{ minWidth: bins.length * (aggregate ? 64 : 48) }}>
        <svg className="raw-dot-rail" viewBox="0 0 1000 60" preserveAspectRatio="none" role="img" aria-label={`${name} ${ko ? '관측 도트 타임라인' : 'observation dot timeline'}`}
          onPointerDown={event => {
            if (event.button !== 0) return;
            anchor.current = indexAt(event.clientX, event.currentTarget);
            event.currentTarget.setPointerCapture(event.pointerId); onChange([anchor.current, anchor.current]);
          }}
          onPointerMove={event => { if (anchor.current !== null) {
            const end = indexAt(event.clientX, event.currentTarget); onChange([Math.min(anchor.current, end), Math.max(anchor.current, end)]);
          } }}
          onPointerUp={() => { anchor.current = null; }} onPointerCancel={() => { anchor.current = null; }} onLostPointerCapture={() => { anchor.current = null; }}>
          <rect className="raw-range-band" x={value[0] / bins.length * 1000} y="1" width={(value[1] - value[0] + 1) / bins.length * 1000} height="58" rx="4" />
          <line x1="0" x2="1000" y1="30" y2="30" className="raw-dot-axis" />
          {bins.map((bin, i) => <line key={bin.start} x1={i / bins.length * 1000} x2={i / bins.length * 1000} y1="8" y2="52" className="raw-dot-tick" />)}
          {stays.flatMap(stay => [stay.started_at, stay.last_observed_at].map((at, edge) => {
            const time = Date.parse(at), index = bins.findIndex(bin => time >= bin.start && time < bin.end);
            if (index < 0) return null;
            const bin = bins[index], x = (index + (time - bin.start) / (bin.end - bin.start)) / bins.length * 1000;
            return <ellipse key={`${stay.id}:${edge}`} className="raw-stay-dot" cx={x} cy="46" rx="3" ry="4"><title>{ko ? '체류 요약 경계' : 'Stay summary boundary'} · {new Date(time).toLocaleString()}</title></ellipse>;
          }))}
          {dots.map((dot, i) => <ellipse key={i} cx={dot.x * 10} cy={30} rx={aggregate ? 3.5 : 2.5} ry={aggregate ? Math.min(7, 3 + Math.log2(dot.count + 1)) : 4}
            className="raw-observation-dot"><title>{new Date(dot.time).toLocaleString()} · {dot.count} {ko ? '관측값' : 'fixes'}</title></ellipse>)}
        </svg>
        <div className="raw-dot-labels" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>
          {bins.map((bin, i) => <button key={bin.start} type="button" title={bin.detail} aria-label={`${name} ${bin.detail}`}
            aria-pressed={i >= value[0] && i <= value[1]} onClick={event => onChange(event.shiftKey ? [Math.min(value[0], i), Math.max(value[1], i)] : [i, i])}>{bin.label}</button>)}
        </div>
      </div>
    </div>
    <div className="raw-range-controls">
      <label>{ko ? `${name} 시작` : `${name} start`}<input type="range" min="0" max={bins.length - 1} value={value[0]} aria-valuetext={bins[value[0]]?.detail}
        onChange={event => { const start = Number(event.target.value); onChange([start, Math.max(start, value[1])]); }} /></label>
      <label>{ko ? `${name} 끝` : `${name} end`}<input type="range" min="0" max={bins.length - 1} value={value[1]} aria-valuetext={bins[value[1]]?.detail}
        onChange={event => { const end = Number(event.target.value); onChange([Math.min(value[0], end), end]); }} /></label>
    </div>
  </fieldset>;
}
export default function RawLocationTimeline({ endDay, samples, ko, onRangeChange, stays = [] }: {
  stays?: Stay[];
  endDay: string; samples: RawSample[]; ko: boolean; onRangeChange: (range: TimeRange) => void;
}) {
  const days = useMemo(() => recentDays(endDay, ko), [endDay, ko]);
  const [dayIndices, setDayIndices] = useState<Indices>([6, 6]);
  const hours = useMemo(() => days.length ? hourlyBins({ start: days[dayIndices[0]].start, end: days[dayIndices[1]].end }, ko) : [], [days, dayIndices, ko]);
  const hourKey = `${hours[0]?.start}:${hours.at(-1)?.end}`;
  const [hourChoice, setHourChoice] = useState<{ key: string; value: Indices } | null>(null);
  const hourIndices: Indices = hourChoice?.key === hourKey ? hourChoice.value : [0, hours.length - 1];
  const start = hours[hourIndices[0]]?.start, end = hours[hourIndices[1]]?.end;
  useEffect(() => { if (start !== undefined && end !== undefined) onRangeChange({ start, end }); }, [start, end, onRangeChange]);
  if (!days.length) return null;
  return <section className="raw-timeline" aria-label={ko ? '위치 관측 타임라인' : 'Location observation timeline'}>
    <h3>{ko ? '시간 범위로 위치 보기' : 'Explore locations by time'}</h3>
    <p>{ko ? '일별 도트는 관측된 시간대, 시간별 도트는 개별 관측값입니다. 도트 영역을 드래그하거나 시작·끝 슬라이더로 범위를 선택하세요. 빈 구간은 관측 없음입니다.' : 'Daily dots mark observed hours; hourly dots mark individual fixes. Drag across dots or use the start/end sliders to select a range. Blank intervals have no observations.'}</p>
    {!!stays.length && <p className="raw-stay-legend">{ko ? '파랑: GPS 관측 · 주황: 체류 요약의 시작/마지막 관측 (사이를 체류 시간으로 채우지 않음)' : 'Blue: GPS fixes · Orange: first/last observations of stay summaries (the interval is not filled as confirmed presence)'}</p>}
    <DotRail stays={stays} bins={days} samples={samples} value={dayIndices} onChange={value => { setDayIndices(previous => previous[0] === value[0] && previous[1] === value[1] ? previous : value); setHourChoice(null); }} aggregate ko={ko} />
    <DotRail stays={stays} bins={hours} samples={samples} value={hourIndices} onChange={value => setHourChoice(previous => previous?.key === hourKey && previous.value[0] === value[0] && previous.value[1] === value[1] ? previous : { key: hourKey, value })} aggregate={false} ko={ko} />
    <p className="raw-selected-range" role="status">{ko ? '선택 범위' : 'Selected range'}: {new Date(start).toLocaleString()} → {new Date(end).toLocaleString()} ({ko ? '끝 시각 미포함' : 'end exclusive'})</p>
  </section>;
}
