import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../client';
import { toLocalDateString } from '../domain';
import { rawSegments, type RawSample } from './domain';
import RawLocationTimeline from './RawLocationTimeline';
import { recentDays, samplesInRange, staysInRange, type TimeRange } from './timeline';
import { developerSamples } from './samples';
import { presence, visibleStay } from '../location-stays/domain';
import type { Stay } from '../location-stays/types';
import { rawRepository } from './repository';
import './raw-location.css';
const RawLocationMap = lazy(() => import('./RawLocationMap'));

class RawMapBoundary extends Component<{ ko: boolean; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">{this.props.ko ? '지도를 불러오지 못했습니다. 아래 관측값 선택과 검사를 이용하세요.' : 'Map unavailable. Use fix selection and inspection below.'}</p> : this.props.children; }
}

function RawLocationWorkspace({ owner, ko, synthetic, cloudStays }: { owner: string; ko: boolean; synthetic: boolean; cloudStays: Stay[] }) {
  const fixture = useMemo(() => synthetic ? developerSamples() : null, [synthetic]);
  const now = Date.now();
  const stays = useMemo(() => (fixture?.stays ?? cloudStays).filter(stay => visibleStay(stay, now)), [fixture, cloudStays, now]);
  const [selectedStay, setSelectedStay] = useState<string | null>(null);
  const repository = useMemo(() => supabase ? rawRepository(owner, (name, args) => supabase!.rpc(name, args)) : null, [owner]);
  const [day, setDay] = useState(() => toLocalDateString(fixture ? new Date(fixture.samples.at(-1)!.observed_at) : new Date())), [samples, setSamples] = useState<RawSample[]>([]);
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false), [checked, setChecked] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange | null>(null);
  const visible = useMemo(() => range ? samplesInRange(samples, range) : [], [samples, range]);
  const visibleStays = useMemo(() => range ? staysInRange(stays, range) : [], [stays, range]);
  useEffect(() => { setSelectedStay(id => visibleStays.some(stay => stay.id === id) ? id : null); }, [visibleStays]);
  const request = useRef(0), deleting = useRef(false);
  const load = useCallback(async () => {
    if (fixture) { setSamples(fixture.samples); setEnabled(true); setError(''); setChecked(null); return; }
    if (!repository || deleting.current) return;
    const current = ++request.current; setBusy(true);
    try {
      const days = recentDays(day);
      if (!days.length) throw new Error('INVALID_DATE');
      const pages = await Promise.all(days.map(bin => repository.read({ from: new Date(bin.start).toISOString(), to: new Date(bin.end).toISOString() })));
      if (pages.some(page => page.epoch !== pages[0].epoch)) throw new Error('EPOCH_CONFLICT');
      const result = { samples: [...new Map(pages.flatMap(page => page.samples).map(sample => [sample.id, sample])).values()], enabled: pages.every(page => page.enabled) };
      if (current !== request.current) return;
      setSamples(result.samples); setEnabled(result.enabled); setError(''); setChecked(new Date().toLocaleTimeString());
      setSelected(id => result.samples.some(s => s.id === id) ? id : result.samples[0]?.id ?? '');
    } catch (e) {
      if (current !== request.current) return;
      const code = e instanceof Error ? e.message : 'NETWORK'; setError(code);
      if (code === 'FORBIDDEN' || code === 'EPOCH_CONFLICT') { setSamples([]); setSelected(''); }
    } finally { if (current === request.current) setBusy(false); }
  }, [repository, day, fixture]);
  useEffect(() => {
    setSamples([]); setSelected(''); setChecked(null); void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refresh, 30000);
    return () => { request.current++; clearInterval(timer); };
  }, [load]);
  useEffect(() => { setSelected(id => visible.some(s => s.id === id) ? id : visible[0]?.id ?? ''); }, [visible]);
  const active = visible.find(s => s.id === selected), index = visible.findIndex(s => s.id === selected);
  return <section className="raw-workspace">
    <h2>{ko ? 'DEV · 연속 위치 원본' : 'DEV · Continuous location originals'}</h2>
    {synthetic && <p className="raw-sample-notice" role="status">{ko ? '합성 샘플 · 실제 워치나 서버 기록이 아닙니다. 샘플은 메모리에서만 표시하며 서버로 전송하지 않습니다.' : 'Synthetic samples · not real watch or server history. Samples stay in memory and are never uploaded.'}</p>}
    <details className="raw-help"><summary>{ko ? '수집·동기화 안내' : 'Capture and sync information'}</summary>
    <p>{ko ? '녹음별 위치나 체류 요약이 아닌, 워치가 측정한 연속 위치 관측값입니다. 선은 인접 관측점만 연결하며 실제 이동 경로를 보장하지 않습니다. 세션 변경·누락·3분 초과 공백·시계 변경에서는 연결을 끊습니다.' : 'Sensor observations from the watch, separate from recording snapshots and stay summaries. Lines connect adjacent fixes, not a guaranteed travel route. Sessions, missing sequences, gaps over 3 minutes and clock changes break the line.'}</p>
    <p>{ko ? '워치 설정 → 클라우드 동기화 → 연속 위치 원본 동기화 동의 후, 위치 기록을 항상으로 설정하세요. 동의 이후 관측값만 전송하며 보존 기간은 7일입니다. 동기화는 약 15분 주기이며 네트워크·절전 상태에 따라 지연될 수 있습니다.' : 'On the watch: Settings → Cloud sync → approve continuous location originals, then set Location recording to Always. Only future fixes upload, retained for 7 days. Sync targets 15-minute intervals and may be delayed by network or power constraints.'}</p>
    </details>
    <div className="raw-toolbar">
      <label>{ko ? '일별 타임라인 마지막 날짜 (현재 시간대)' : 'Daily timeline end date (local timezone)'}<input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
      <button type="button" disabled={busy || (!repository && !synthetic)} onClick={() => void load()}>{ko ? '새로고침' : 'Refresh fixes'}</button>
    </div>
    {error && <p role="alert">{error === 'UNAVAILABLE' ? (ko ? '서버에 위치 원본 API가 아직 배포되지 않았습니다.' : 'The raw location API is not deployed on this server.') : (ko ? '위치 원본을 불러오지 못했습니다. 연결과 접근 권한을 확인하세요.' : 'Could not refresh original locations. Check connection and access.')} ({error})</p>}
    <RawLocationTimeline key={day} endDay={day} samples={samples} stays={stays} ko={ko} onRangeChange={setRange} />
    <p role="status">{busy ? (ko ? '불러오는 중…' : 'Loading…') : `${visible.length} / ${samples.length} ${ko ? '관측값' : 'fixes'} · ${rawSegments(visible).length} ${ko ? '구간' : 'segments'}`}{checked ? ` · ${checked}` : ''}</p>
    {!enabled && !busy && !error && <p>{ko ? '원본 위치 전송 동의가 필요합니다. 기존 서버 데이터는 만료 전까지 조회할 수 있습니다.' : 'Raw upload consent is required on the watch. Retained server data remains readable until expiry.'}</p>}
    {!samples.length && !busy && !error && <p>{ko ? '이 7일간 서버로 동기화된 연속 위치가 없습니다.' : 'No synchronized continuous locations for these seven days.'}</p>}
    {!!samples.length && !visible.length && !busy && <p>{ko ? '선택한 시간 범위에 관측값이 없습니다. 다른 범위를 선택하세요.' : 'No fixes in the selected time range. Select another range.'}</p>}
    <RawMapBoundary ko={ko}><Suspense fallback={<p>{ko ? '지도 불러오는 중…' : 'Loading map…'}</p>}><RawLocationMap stays={visibleStays} selectedStay={selectedStay} onSelectStay={setSelectedStay} samples={visible} fitKey={`${range?.start}:${range?.end}`} selected={selected} onSelect={setSelected} ko={ko} /></Suspense></RawMapBoundary>
    <section className="raw-stay-samples" aria-label={ko ? '선택 범위의 체류' : 'Stays in selected range'}>
      <h3>{ko ? '선택 범위의 체류' : 'Stays in selected range'} · {visibleStays.length}</h3>
      <p>{ko ? '주황색 영역은 체류 요약의 관측 범위입니다. 원본 GPS 정확도나 연속 관측을 뜻하지 않습니다.' : 'Orange areas show stay-summary observation regions, separate from raw GPS accuracy and continuous evidence.'}</p>
      {!visibleStays.length && <p>{ko ? '선택 범위에 체류 요약이 없습니다.' : 'No stay summaries in this range.'}</p>}
      {visibleStays.map(stay => <button type="button" key={stay.id} aria-pressed={selectedStay === stay.id} onClick={() => setSelectedStay(stay.id)}>
        {synthetic ? (ko ? '샘플 체류' : 'Sample stay') : (ko ? '체류' : 'Stay')} · {new Date(stay.started_at).toLocaleString()} · {Math.floor(stay.observed_duration_millis / 60000)} {ko ? '분 확인' : 'min observed'}
      </button>)}
      {visibleStays.filter(stay => stay.id === selectedStay).map(stay => <section key={stay.id} aria-label={ko ? '체류 원본 검사' : 'Stay source inspector'}>
        <p>{ko ? '전체 체류 요약의 확인 시간입니다. 선택 구간 비율로 시간을 추정하지 않습니다.' : 'Confirmed duration belongs to the complete stay summary; it is not estimated from the selected overlap.'}</p>
        <p>{presence(stay, Date.now())} · {stay.end_reason ?? '—'}</p>
        <dl>{Object.entries(stay).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value === null ? (ko ? '미수집' : 'Not collected') : String(value)}</dd></div>)}</dl>
      </section>)}
    </section>
    {active && <section aria-label={ko ? '위치 원본 검사' : 'Raw fix inspector'}>
      <label>{ko ? '관측값 선택' : 'Select fix'}<select value={selected} onChange={e => setSelected(e.target.value)}>
        {visible.map((s, i) => <option key={s.id} value={s.id}>#{i + 1} · {s.observed_at}</option>)}
      </select></label>
      <div className="raw-toolbar"><button type="button" disabled={index <= 0} onClick={() => setSelected(visible[index - 1].id)}>{ko ? '이전 관측' : 'Previous fix'}</button><button type="button" disabled={index >= visible.length - 1} onClick={() => setSelected(visible[index + 1].id)}>{ko ? '다음 관측' : 'Next fix'}</button></div>
      <dl>{['id', 'session_id', 'sequence', 'observed_at', 'latitude', 'longitude', 'accuracy_meters', 'altitude', 'speed', 'fix_age_millis', 'elapsed_realtime_millis', 'clock_discontinuity'].map(key =>
        <div key={key}><dt>{key}</dt><dd>{active[key as keyof RawSample] === undefined ? (ko ? '미수집' : 'Not collected') : String(active[key as keyof RawSample])}</dd></div>)}</dl>
    </section>}
    <p>{ko ? '지도 배경은 OpenStreetMap에서 불러옵니다. 원본 좌표를 조회·삭제해도 음성 원본은 변경하지 않습니다.' : 'Map tiles load from OpenStreetMap. Reading or deleting raw fixes leaves original audio intact.'}</p>
    {!synthetic && <button type="button" disabled={busy || !repository} onClick={async () => {
      if (!repository || !confirm(ko ? '서버의 모든 연속 위치 원본을 삭제할까요? 지연 업로드로 복구되지 않습니다. 녹음과 체류 요약은 유지됩니다.' : 'Delete all server raw locations? Delayed uploads will not restore them. Recordings and stay summaries remain.')) return;
      deleting.current = true; request.current++; setBusy(true);
      try { await repository.deleteAll(); setSamples([]); setSelected(''); setError(''); }
      catch (e) { setError(e instanceof Error ? e.message : 'NETWORK'); }
      finally { deleting.current = false; setBusy(false); void load(); }
    }}>{ko ? '서버의 연속 위치 원본 전체 삭제' : 'Delete all server raw locations'}</button>}
  </section>;
}
export default function RawLocationLauncher({ owner, lang, isDemo, stays = [] }: { owner: string; lang: 'ko' | 'en'; isDemo: boolean; stays?: Stay[] }) {
  const [synthetic, setSynthetic] = useState(isDemo);
  const [open, setOpen] = useState(false), dialog = useRef<HTMLDialogElement>(null), button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const ko = lang === 'ko';
  return <>
    <button ref={button} type="button" className="lang-switch-btn" aria-label={ko ? '개발자 연속 위치 지도' : 'Developer continuous location map'} aria-pressed={open} onClick={() => setOpen(true)}>DEV</button>
    {createPortal(<dialog ref={dialog} className="raw-location-dialog" aria-label={ko ? '개발자 연속 위치 지도' : 'Developer continuous location map'} onClose={() => { setOpen(false); button.current?.focus(); }}>
      <button type="button" onClick={() => setOpen(false)}>{ko ? '닫기' : 'Close'}</button>
      {open && <>
        <label>{ko ? '개발 데이터' : 'Developer data'}<select aria-label={ko ? '개발 데이터' : 'Developer data'} value={synthetic ? 'sample' : 'server'} onChange={event => setSynthetic(event.target.value === 'sample')}>
          {!isDemo && <option value="server">{ko ? '서버 데이터' : 'Server data'}</option>}
          <option value="sample">{ko ? '샘플 GPS + 체류' : 'Sample GPS + stays'}</option>
        </select></label>
        <RawLocationWorkspace key={synthetic ? 'sample' : 'server'} owner={owner} ko={ko} synthetic={synthetic} cloudStays={synthetic ? [] : stays} />
      </>}
    </dialog>, document.body)}
  </>;
}
