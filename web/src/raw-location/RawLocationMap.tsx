import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { rawSegments, type RawSample } from './domain';

export default function RawLocationMap({ samples, selected, onSelect, ko }: {
  samples: RawSample[]; selected: string; onSelect: (id: string) => void; ko: boolean;
}) {
  const container = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null), accuracy = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onSelect); callback.current = onSelect;
  const [tileError, setTileError] = useState(false);
  const signature = JSON.stringify(samples);
  useEffect(() => {
    if (!container.current || !samples.length) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }); map.current = instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, referrerPolicy: 'origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).on('tileerror', () => setTileError(true)).addTo(instance);
    layer.current = L.layerGroup().addTo(instance); accuracy.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize({ animate: false })); resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; layer.current = null; accuracy.current = null; };
  }, [samples.length > 0]);
  useEffect(() => {
    const instance = map.current, group = layer.current; if (!instance || !group) return;
    group.clearLayers();
    rawSegments(samples).forEach(segment => {
      if (segment.length > 1) L.polyline(segment.map(s => [s.latitude, s.longitude]), { color: '#2563eb', weight: 2, opacity: 0.7 }).addTo(group);
    });
    samples.forEach((s, index) => {
      const tooltip = document.createElement('span'); tooltip.textContent = `#${index + 1} · ${s.observed_at}`;
      L.circleMarker([s.latitude, s.longitude], { radius: 5, color: '#1d4ed8', fillOpacity: 0.8, weight: 1 })
        .bindTooltip(tooltip).on('click', () => callback.current(s.id)).addTo(group);
    });
    // Keep the user's view on automatic refresh; explicit Show all remains available.
    if (!instance.getZoom()) instance.fitBounds(L.latLngBounds(samples.map(s => [s.latitude, s.longitude])), { maxZoom: 16, padding: [24, 24] });
  }, [signature]);
  useEffect(() => {
    const instance = map.current, group = accuracy.current; if (!instance || !group) return;
    group.clearLayers(); const s = samples.find(s => s.id === selected); if (!s) return;
    L.circle([s.latitude, s.longitude], { radius: s.accuracy_meters, color: '#f43f5e', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(group);
    L.circleMarker([s.latitude, s.longitude], { radius: 8, color: '#f43f5e', weight: 3, fillOpacity: 0, interactive: false }).addTo(group);
    if (!instance.getBounds().contains([s.latitude, s.longitude])) instance.panInside([s.latitude, s.longitude], { animate: false });
  }, [selected, signature]);
  return <>
    <button type="button" disabled={!samples.length} onClick={() => map.current?.fitBounds(L.latLngBounds(samples.map(s => [s.latitude, s.longitude])), { maxZoom: 16, padding: [24, 24] })}>{ko ? '전체 위치 보기' : 'Show all fixes'}</button>
    {samples.length > 0 && <div ref={container} className="recording-map raw-location-map" role="region" aria-label={ko ? '연속 위치 원본 지도' : 'Continuous raw location map'} />}
    {tileError && <p role="status">{ko ? '지도 배경을 불러오지 못했습니다. 관측값 선택과 검사는 계속 사용할 수 있습니다.' : 'Map tiles unavailable. Fix selection and inspection remain available.'}</p>}
  </>;
}
