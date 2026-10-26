import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { coordinatesValid } from "./domain.ts";

/** Independent of recordings. Numeric fields in PlaceEditor remain the accessible fallback. */
export function PlaceMap({ latitude, longitude, radius, onSelect, lang = "ko" }: {
  latitude: number; longitude: number; radius: number;
  onSelect: (latitude: number, longitude: number) => void; lang?: "ko" | "en";
}) {
  const node = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), circle = useRef<L.Circle | null>(null);
  const selection = useRef(onSelect); selection.current = onSelect;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!node.current) return;
    const instance = L.map(node.current, { scrollWheelZoom: false }).setView([37.5, 127], 14);
    map.current = instance;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, referrerPolicy: "origin", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    tiles.on("tileerror", () => setFailed(true));
    instance.on("click", (event: L.LeafletMouseEvent) => selection.current(event.latlng.lat, event.latlng.lng));
    const resize = new ResizeObserver(() => instance.invalidateSize({ animate: false }));
    resize.observe(node.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; circle.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    if (!coordinatesValid(latitude, longitude) || !Number.isFinite(radius) || radius < 150 || radius > 2_000) {
      circle.current?.remove(); circle.current = null;
      return;
    }
    if (!circle.current) circle.current = L.circle([latitude, longitude], { radius }).addTo(map.current);
    else circle.current.setLatLng([latitude, longitude]).setRadius(radius);
    map.current.panTo([latitude, longitude], { animate: false });
  }, [latitude, longitude, radius]);
  return <div>
    <div ref={node} style={{ minHeight: 260 }} role="region" aria-label={lang === "ko" ? "장소 영역 지도" : "Place area map"} />
    {failed && <p role="status">{lang === "ko" ? "지도를 불러오지 못했습니다. 좌표 입력을 사용할 수 있습니다." : "Map tiles unavailable. You can enter coordinates below."}</p>}
    <small>{lang === "ko" ? "지도는 OpenStreetMap에서 불러옵니다. GPS 영역은 정확한 건물 경계가 아닙니다." : "Map tiles load from OpenStreetMap. A GPS area is not a precise building boundary."}</small>
  </div>;
}
