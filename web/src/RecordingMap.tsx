import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { hasLocation, latest } from "./domain";
import type { Recording } from "./domain";

export default function RecordingMap({
  recordings,
  selectedId,
  onSelect,
  className,
  showRoute = true,
  lang = "en",
}: {
  recordings: Recording[];
  selectedId: string | null;
  onSelect: (id: string, revealDetails?: boolean) => void;
  className?: string;
  showRoute?: boolean;
  lang?: "ko" | "en";
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.Polyline | null>(null);
  const markersById = useRef(new Map<string, L.Marker>());
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const [tileError, setTileError] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const shortDate = (value: string) => new Date(value).toLocaleString(locale, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const located = recordings.filter(hasLocation);

  // Refreshing identical data must not reset a user's pan/zoom every 15 seconds.
  const locations = JSON.stringify(
    located.map((r) => [r.id, r.latitude, r.longitude]),
  );
  const markerData = JSON.stringify(
    located.map(
      (r) => [r.id, r.latitude, r.longitude, r.recorded_at, latest(r)?.summary],
    ),
  );
  const initialBounds = useRef("");

  useEffect(() => {
    if (!container.current || !located.length) return;
    const instance = L.map(container.current, { scrollWheelZoom: false })
      .setView([located[0].latitude, located[0].longitude], 15);
    map.current = instance;
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        // Send only our origin for tile-policy compliance; retain no-referrer elsewhere.
        referrerPolicy: "origin",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    ).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    markers.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);

    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      markers.current = null;
      routeLayer.current = null;
      initialBounds.current = "";
    };
  }, [located.length > 0]);

  useEffect(() => {
    const instance = map.current, layer = markers.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    markersById.current.clear();
    if (routeLayer.current) {
      routeLayer.current.remove();
      routeLayer.current = null;
    }

    // Connect sequential GPS records with a coral route line
    if (showRoute && located.length > 1) {
      const sorted = [...located].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
      );
      const points: L.LatLngExpression[] = sorted.map((r) => [r.latitude, r.longitude]);
      routeLayer.current = L.polyline(points, {
        color: "#f43f5e",
        weight: 3,
        opacity: 0.7,
        dashArray: "6, 8",
      }).addTo(instance);
    }

    const groups = new Map<string, typeof located>();
    for (const r of located) {
      const key = `${r.latitude},${r.longitude}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const entries of groups.values()) {
      const first = entries[0];
      const label = entries.length > 1
        ? `${entries.length} recordings at this place`
        : `Recording ${new Date(first.recorded_at).toLocaleString()}`;
      const marker = L.marker([first.latitude, first.longitude], {
        title: label,
        alt: label,
        keyboard: true,
        icon: L.divIcon({
          className: "voice-marker",
          html: `<span class="voice-pin" aria-hidden="true"><svg viewBox="0 0 24 30"><path d="M12 1C6 1 2 5.5 2 11c0 7 10 18 10 18s10-11 10-18C22 5.5 18 1 12 1Z"/><circle cx="12" cy="11" r="3"/></svg></span>${entries.length > 1 ? `<span class="voice-pin-count" aria-hidden="true">${entries.length}</span>` : ""}`,
          iconSize: [44, 44],
          iconAnchor: [22, 36],
          popupAnchor: [0, -32],
        }),
      }).addTo(layer);
      entries.forEach((r) => markersById.current.set(r.id, marker));
      const popup = document.createElement("div");
      popup.className = "map-recordings";
      for (const r of entries) {
        const button = document.createElement("button");
        button.type = "button";
        const time = document.createElement("small");
        time.textContent = shortDate(r.recorded_at);
        const summary = document.createElement("span");
        summary.textContent = latest(r)?.summary || (lang === "ko" ? "음성 기록" : "Voice recording");
        button.append(time, summary);
        button.addEventListener("click", () => selection.current(r.id, true));
        popup.appendChild(button);
      }
      if (!mobile) marker.bindPopup(popup, { className: "recording-popup", maxWidth: 240, minWidth: 180 });
      marker.on("click", () => {
        setDismissedId(null);
        selection.current(first.id);
        // Selecting an already highlighted place should still reveal its records.
        if (!mobile) marker.openPopup();
      });
    }
    if (initialBounds.current !== locations) {
      instance.fitBounds(
        L.latLngBounds(located.map((r) => [r.latitude, r.longitude])),
        { padding: [36, 36], maxZoom: 15 },
      );
      initialBounds.current = locations;
    }
  }, [markerData, locations, showRoute, mobile, lang]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const marker of markersById.current.values()) {
      marker.getElement()?.classList.remove("active");
    }
    if (selectedId) {
      const activeMarker = markersById.current.get(selectedId);
      activeMarker?.getElement()?.classList.add("active");
      const active = located.find((r) => r.id === selectedId);
      if (active) {
        instance.flyTo(
          [active.latitude, active.longitude],
          Math.max(instance.getZoom(), 15),
          { duration: 0.8 },
        );
        if (!mobile) activeMarker?.openPopup();
      }
    }
  }, [selectedId, markerData, mobile, lang]);

  const active = located.find((r) => r.id === selectedId);
  const placeCount = active ? located.filter((r) =>
    r.latitude === active.latitude && r.longitude === active.longitude
  ).length : 0;

  return (
    <>
      {located.length ? (
        <div
          ref={container}
          className={`recording-map ${className ?? ""}`}
          role="region"
          aria-label="Map of recording locations"
        />
      ) : (
        <p className="map-empty">
          {lang === "ko" ? "선택한 기록에 저장된 위치가 없어요. 위치 없는 기록도 목록에서 볼 수 있어요." : "No saved locations in this selection. Recordings without GPS are still available in the list."}
        </p>
      )}
      {mobile && active && dismissedId !== active.id && (
        <div className="map-selection-card" aria-label={lang === "ko" ? "선택한 기록" : "Selected recording"}>
          <button className="map-selection-detail" onClick={() => onSelect(active.id, true)}>
            <small>{shortDate(active.recorded_at)}{placeCount > 1 ? ` · ${lang === "ko" ? `이 장소 기록 ${placeCount}개` : `${placeCount} recordings here`}` : ""}</small>
            <strong>{latest(active)?.summary || (lang === "ko" ? "음성 기록" : "Voice recording")}</strong>
            <span>{lang === "ko" ? "상세 보기 →" : "View details →"}</span>
          </button>
          <button className="map-selection-close" aria-label={lang === "ko" ? "요약 닫기" : "Dismiss summary"} onClick={() => setDismissedId(active.id)}>×</button>
        </div>
      )}
      <p className="map-caption">
        {lang === "ko" ? `${recordings.length}개 중 ${located.length}개 기록에 위치가 저장되어 있어요. 지도는 OpenStreetMap에서 불러오며 음성과 텍스트는 지도 제공자에게 보내지 않아요.` : `${located.length} of ${recordings.length} recordings have a saved location. Others remain in the list. Map tiles load from OpenStreetMap. No recording audio or text is sent to the map provider.`}
      </p>
      {tileError && (
        <p role="status" className="map-caption">
          {lang === "ko" ? "지도 배경을 불러오지 못했어요. 핀과 기록 목록은 계속 사용할 수 있어요." : "Map tiles could not be loaded. Pins and the recording list are still available."}
        </p>
      )}
    </>
  );
}
