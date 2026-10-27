import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Stay } from '../location-stays/types';
import { rawSegments, type RawSample } from './domain';

export default function RawLocationMap({ samples, selected, onSelect, ko, fitKey, stays, selectedStay, onSelectStay }: {
  stays: Stay[]; selectedStay: string | null; onSelectStay: (id: string) => void;
  fitKey: string; samples: RawSample[]; selected: string; onSelect: (id: string) => void; ko: boolean;
}) {
  const container = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null);
  const regions = useRef<L.LayerGroup | null>(null);
  const stayCallback = useRef(onSelectStay); stayCallback.current = onSelectStay;
  const lines = useRef<L.LayerGroup | null>(null);
  const [showLine, setShowLine] = useState(true);
  const layer = useRef<L.LayerGroup | null>(null), accuracy = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onSelect); callback.current = onSelect;
  const [tileError, setTileError] = useState(false);
  const signature = JSON.stringify(samples), staySignature = JSON.stringify(stays);
  const positions: L.LatLngExpression[] = [...samples.map(s => [s.latitude, s.longitude] as [number, number]), ...stays.map(stay => [stay.representative_latitude, stay.representative_longitude] as [number, number])];
  const fittedRange = useRef<string | null>(null);
  useEffect(() => {
    if (!container.current || !positions.length) return;
    const instance = L.map(container.current, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false }); map.current = instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, referrerPolicy: 'origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).on('tileerror', () => setTileError(true)).addTo(instance);
    regions.current = L.layerGroup().addTo(instance);
    lines.current = L.layerGroup().addTo(instance);
    layer.current = L.layerGroup().addTo(instance); accuracy.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize({ animate: false })); resize.observe(container.current);
    return () => { resize.disconnect(); instance.stop(); instance.remove(); map.current = null; regions.current = null; lines.current = null; layer.current = null; accuracy.current = null; };
  }, [positions.length > 0]);
  useEffect(() => {
    const instance = map.current, group = layer.current; if (!instance || !group) return;
    group.clearLayers();
    samples.forEach((s, index) => {
      const tooltip = document.createElement('span'); tooltip.textContent = `#${index + 1} · ${s.observed_at}`;
      L.circleMarker([s.latitude, s.longitude], { radius: 5, color: '#1d4ed8', fillOpacity: 0.8, weight: 1 })
        .bindTooltip(tooltip).on('click', () => callback.current(s.id)).addTo(group);
    });
    // Keep the user's view on automatic refresh; explicit Show all remains available.
    if (!instance.getZoom() || fittedRange.current !== fitKey) instance.fitBounds(L.latLngBounds(positions), { maxZoom: 16, padding: [24, 24], animate: false });
    fittedRange.current = fitKey;
  }, [signature, staySignature, fitKey]);
  useEffect(() => {
    const group = lines.current;
    if (!group) return;
    group.clearLayers();
    if (!showLine) return;
    rawSegments(samples).forEach(segment => {
      if (segment.length > 1) L.polyline(segment.map(s => [s.latitude, s.longitude]), {
        color: '#2563eb', weight: 2, opacity: 0.7, interactive: false, className: 'raw-connection-line',
      }).addTo(group).bringToBack();
    });
  }, [signature, showLine]);
  useEffect(() => {
    const instance = map.current, group = accuracy.current; if (!instance || !group) return;
    group.clearLayers(); const s = samples.find(s => s.id === selected); if (!s) return;
    L.circle([s.latitude, s.longitude], { radius: s.accuracy_meters, color: '#f43f5e', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(group);
    L.circleMarker([s.latitude, s.longitude], { radius: 8, color: '#f43f5e', weight: 3, fillOpacity: 0, interactive: false }).addTo(group);
    if (!instance.getBounds().contains([s.latitude, s.longitude])) instance.panInside([s.latitude, s.longitude], { animate: false });
  }, [selected, signature]);
  useEffect(() => {
    const group = regions.current, instance = map.current;
    if (!group || !instance) return;
    group.clearLayers();
    stays.forEach(stay => {
      const center: L.LatLngExpression = [stay.representative_latitude, stay.representative_longitude];
      L.circle(center, { radius: stay.observation_radius_meters, color: '#f59e0b', weight: stay.id === selectedStay ? 3 : 1,
        fillOpacity: .1, dashArray: '4 4', className: 'raw-stay-region' }).on('click', () => stayCallback.current(stay.id)).addTo(group).bringToBack();
      const title = `${ko ? '체류 요약' : 'Stay summary'} · ${stay.started_at}`;
      L.marker(center, { title, alt: title, keyboard: true, icon: L.divIcon({ className: 'raw-stay-marker', html: 'S', iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .on('click', () => stayCallback.current(stay.id)).addTo(group);
    });
    const active = stays.find(stay => stay.id === selectedStay);
    if (active) instance.panInside([active.representative_latitude, active.representative_longitude], { animate: false });
  }, [staySignature, selectedStay, ko]);
  return <>
    <div className="raw-toolbar">
    <button type="button" aria-label={ko ? '시점순 위치 연결선' : 'Chronological connection line'} aria-pressed={showLine}
      onClick={() => setShowLine(value => !value)}>{ko ? '시점순 연결선' : 'Chronological line'} · {showLine ? 'ON' : 'OFF'}</button>
    <button type="button" disabled={!positions.length} onClick={() => map.current?.fitBounds(L.latLngBounds(positions), { maxZoom: 16, padding: [24, 24], animate: false })}>{ko ? '전체 위치 보기' : 'Show all locations'}</button>
    </div>
    {positions.length > 0 && <div ref={container} className="recording-map raw-location-map" role="region" aria-label={ko ? '연속 위치 원본 지도' : 'Continuous raw location map'} />}
    {tileError && <p role="status">{ko ? '지도 배경을 불러오지 못했습니다. 관측값 선택과 검사는 계속 사용할 수 있습니다.' : 'Map tiles unavailable. Fix selection and inspection remain available.'}</p>}
  </>;
}
