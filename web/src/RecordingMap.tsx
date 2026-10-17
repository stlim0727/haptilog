import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { hasLocation, latest } from "./domain";
import type { Recording } from "./domain";

export default function RecordingMap({ recordings, selectedId, onSelect }: {
  recordings: Recording[];
  selectedId: string | null;
  onSelect: (id: string, revealDetails?: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const markersById = useRef(new Map<string, L.Marker>());
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const [tileError, setTileError] = useState(false);
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
      initialBounds.current = "";
    };
  }, [located.length > 0]);
  useEffect(() => {
    const instance = map.current, layer = markers.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    markersById.current.clear();
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
          html: `<span>${entries.length > 1 ? entries.length : "●"}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).addTo(layer);
      entries.forEach((r) => markersById.current.set(r.id, marker));
      const popup = document.createElement("div");
      popup.className = "map-recordings";
      for (const r of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${new Date(r.recorded_at).toLocaleString()} · ${
          latest(r)?.summary || "Voice recording"
        }`;
        button.addEventListener("click", () => selection.current(r.id, true));
        popup.appendChild(button);
      }
      marker.bindPopup(popup);
      marker.on("click", () => {
        if (entries.length === 1) selection.current(first.id);
      });
    }
    if (initialBounds.current !== locations) {
      instance.fitBounds(
        L.latLngBounds(located.map((r) => [r.latitude, r.longitude])),
        { padding: [36, 36], maxZoom: 15 },
      );
      initialBounds.current = locations;
    }
  }, [markerData, locations]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const marker of markersById.current.values()) {
      marker.getElement()?.classList.remove("active");
    }
    if (selectedId) {
      markersById.current.get(selectedId)?.getElement()?.classList.add(
        "active",
      );
    }
    const active = located.find((r) => r.id === selectedId);
    if (
      active &&
      !instance.getBounds().contains([active.latitude, active.longitude])
    ) instance.panTo([active.latitude, active.longitude]);
  }, [selectedId, markerData]);
  return (
    <>
      {located.length
        ? (
          <div
            ref={container}
            className="recording-map"
            role="region"
            aria-label="Map of recording locations"
          />
        )
        : (
          <p className="map-empty">
            No saved locations in this selection. Recordings without GPS are
            still available in the list.
          </p>
        )}
      <p className="map-caption">
        {located.length} of {recordings.length}{" "}
        recordings have a saved location.{" "}
        {recordings.length - located.length > 0 && "Others remain in the list."}
        {" "}
        Map tiles load from OpenStreetMap. No recording audio or text is sent to
        the map provider.
      </p>
      {tileError && (
        <p role="status" className="map-caption">
          Map tiles could not be loaded. Pins and the recording list are still
          available.
        </p>
      )}
    </>
  );
}
