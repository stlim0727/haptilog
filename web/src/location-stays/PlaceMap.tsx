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
  const handle = useRef<L.Marker | null>(null);
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
    return () => { resize.disconnect(); instance.remove(); map.current = null; circle.current = null; handle.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    if (!coordinatesValid(latitude, longitude) || !Number.isFinite(radius) || radius < 150 || radius > 2_000) {
      circle.current?.remove(); circle.current = null;
      handle.current?.remove(); handle.current = null;
      return;
    }
    if (!circle.current) circle.current = L.circle([latitude, longitude], { radius }).addTo(map.current);
    else circle.current.setLatLng([latitude, longitude]).setRadius(radius);
    if (!handle.current) {
      // Leaflet's marker drag claims the gesture before map panning and does not bubble clicks to the
      // map, so no guard is needed against panning or re-tapping while the handle is released.
      const marker = L.marker([latitude, longitude], {
        draggable: true,
        icon: L.divIcon({ className: "place-drag-handle", iconSize: [44, 44], iconAnchor: [22, 22] }),
        title: lang === "ko" ? "끌어 위치를 옮깁니다" : "Drag to move this place",
        alt: lang === "ko" ? "장소 중심 손잡이" : "Place center handle",
      }).addTo(map.current);
      marker.on("drag", () => circle.current?.setLatLng(marker.getLatLng()));
      marker.on("dragend", () => { const at = marker.getLatLng(); selection.current(at.lat, at.lng); });
      handle.current = marker;
    } else handle.current.setLatLng([latitude, longitude]);
    map.current.panTo([latitude, longitude], { animate: false });
  }, [latitude, longitude, radius]);
  return <div>
    <div ref={node} style={{ minHeight: 260 }} role="region" aria-label={lang === "ko" ? "장소 영역 지도" : "Place area map"} />
    {failed && <p role="status">{lang === "ko" ? "지도를 불러오지 못했습니다. 좌표 입력을 사용할 수 있습니다." : "Map tiles unavailable. You can enter coordinates below."}</p>}
    <small>{lang === "ko" ? "손잡이를 끌어 위치를 옮기거나 지도를 탭하세요. 지도는 OpenStreetMap에서 불러오며 GPS 영역은 정확한 건물 경계가 아닙니다." : "Drag the handle or tap the map to move this place. Map tiles load from OpenStreetMap and a GPS area is not a precise building boundary."}</small>
  </div>;
}
