import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { hasLocation, latest } from "./domain";
import { CLUSTER_MAX_ZOOM, clusterLocations } from "./mapClustering";
import type { Recording } from "./domain";

export default function RecordingMap({
  recordings,
  selectedId,
  onSelect,
  className,
  showRoute = true,
  lang = "en",
  heading,
}: {
  recordings: Recording[];
  selectedId: string | null;
  onSelect: (id: string, revealDetails?: boolean) => void;
  className?: string;
  showRoute?: boolean;
  lang?: "ko" | "en";
  heading?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.Polyline | null>(null);
  const markersById = useRef(new Map<string, L.Marker>());
  const clusterSizes = useRef(new Map<string, number>());
  const selected = useRef(selectedId);
  selected.current = selectedId;
  const pinSelection = useRef<string | null>(null);
  const previousSelection = useRef(selectedId);
  const zooming = useRef(false);
  const pendingFit = useRef<(() => void) | null>(null);
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const [tileError, setTileError] = useState(false);
  const [clusterRevision, setClusterRevision] = useState(0);
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
    const instance = L.map(container.current, {
      scrollWheelZoom: false,
      zoomAnimation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    })
      .setView([located[0].latitude, located[0].longitude], 15);
    map.current = instance;
    instance.on("zoomstart", () => { zooming.current = true; });
    instance.on("zoomend", () => {
      zooming.current = false;
      const fit = pendingFit.current;
      pendingFit.current = null;
      fit?.();
      setClusterRevision((revision) => revision + 1);
    });
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
    const resize = new ResizeObserver(() => {
      // Detail navigation hides this map; do not replace its saved size with zero.
      if (container.current?.clientWidth && container.current.clientHeight) {
        instance.invalidateSize({ animate: false });
      }
    });
    resize.observe(container.current);

    return () => {
      resize.disconnect();
      pendingFit.current = null;
      zooming.current = false;
      instance.stop();
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
    clusterSizes.current.clear();
    if (routeLayer.current) {
      routeLayer.current.remove();
      routeLayer.current = null;
    }

    // Fit before grouping so pins cluster at the zoom the view actually lands on.
    if (initialBounds.current !== locations) {
      instance.fitBounds(
        L.latLngBounds(located.map((r) => [r.latitude, r.longitude])),
        { padding: [36, 36], maxZoom: 15, animate: false },
      );
      initialBounds.current = locations;
    }
    const zoom = instance.getZoom();

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

    for (const cluster of clusterLocations(located, zoom)) {
      const entries = cluster.members;
      const first = [...entries].sort((a, b) =>
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
      )[0];
      const label = entries.length < 2
        ? `Recording ${new Date(first.recorded_at).toLocaleString()}`
        : lang === "ko"
          ? (cluster.coLocated
              ? `이 장소의 기록 ${entries.length}개`
              : `이 근처의 기록 ${entries.length}개`)
          : (cluster.coLocated
              ? `${entries.length} recordings at this place`
              : `${entries.length} recordings nearby`);
      // Nearby-but-distinct places drill down instead of opening a list.
      const expandable = entries.length > 1 && !cluster.coLocated &&
        zoom < instance.getMaxZoom();
      const marker = L.marker([cluster.latitude, cluster.longitude], {
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
      entries.forEach((r) => {
        markersById.current.set(r.id, marker);
        clusterSizes.current.set(r.id, entries.length);
      });
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
      if (!mobile) marker.bindPopup(popup, { className: "recording-popup", maxWidth: 240, minWidth: 180, autoPan: false });
      marker.on("click", () => {
        if (expandable) {
          const expand = () => {
            if (map.current !== instance) return;
            instance.fitBounds(
              L.latLngBounds(entries.map((r) => [r.latitude, r.longitude])),
              { padding: [36, 36] },
            );
          };
          if (zooming.current) pendingFit.current = expand;
          else expand();
          return;
        }
        setDismissedId(null);
        const id = entries.find((r) => r.id === selected.current)?.id ?? first.id;
        pinSelection.current = id;
        selection.current(id);
        // Selecting an already highlighted place should still reveal its records.
        if (!mobile) {
          // Only a deliberate pin tap may nudge an edge popup into view.
          const popup = marker.getPopup();
          if (popup) {
            popup.options.autoPan = true;
            marker.openPopup();
            popup.update();
            popup.options.autoPan = false;
          }
        }
      });
    }
  }, [markerData, locations, showRoute, mobile, lang, clusterRevision]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const marker of markersById.current.values()) {
      marker.getElement()?.classList.remove("active");
    }
    const changed = previousSelection.current !== selectedId;
    previousSelection.current = selectedId;
    if (selectedId) {
      const activeMarker = markersById.current.get(selectedId);
      activeMarker?.getElement()?.classList.add("active");
      const active = located.find((r) => r.id === selectedId);
      // A direct pin tap never changes the view. External selections only reveal
      // an offscreen place, retaining the user's zoom.
      if (active && changed && pinSelection.current !== selectedId) {
        instance.panInside([active.latitude, active.longitude], {
          padding: [36, 36],
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      }
      if (!mobile && changed) activeMarker?.openPopup();
    }
    pinSelection.current = null;
  }, [selectedId, markerData, mobile, lang, showRoute, clusterRevision]);

  const active = located.find((r) => r.id === selectedId);
  const placeCount = active ? clusterSizes.current.get(active.id) ?? 0 : 0;

  function showAll() {
    const instance = map.current;
    if (!instance || !located.length) return;
    const fit = () => {
      if (map.current !== instance) return;
      instance.stop();
      instance.closePopup();
      instance.fitBounds(
        L.latLngBounds(located.map((r) => [r.latitude, r.longitude])),
        { padding: [36, 36], maxZoom: 15, animate: false },
      );
    };
    // Leaflet cannot reset bounds midway through a CSS zoom transition.
    if (zooming.current) pendingFit.current = fit;
    else fit();
  }

  return (
    <>
      <div className="map-view-toolbar">
        <h2>{heading ?? (lang === "ko" ? "기록이 남은 장소" : "Your voices, by place.")}</h2>
        <button type="button" className="map-show-all" disabled={!located.length} onClick={showAll}>
          {lang === "ko" ? "전체 보기" : "Show all locations"}
        </button>
      </div>
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
        <div className="map-selection-card" onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDismissedId(active.id);
            markersById.current.get(active.id)?.getElement()?.focus();
          }
        }} aria-label={lang === "ko" ? "선택한 기록" : "Selected recording"}>
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
