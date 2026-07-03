import { useEffect } from "react";
import { divIcon, type DivIcon } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip as LeafletTooltip,
  ZoomControl,
  useMap,
  useMapEvent,
} from "react-leaflet";
import type { TrackPoint, Vehicle } from "../types";
import { STATUS_META, vehicleStatus } from "../lib/status";

const CARTAGENA: [number, number] = [10.391, -75.4794];

const iconCache = new Map<string, DivIcon>();

/** Flecha de navegación rotada según el rumbo; anillo suave cuando está seleccionada. */
export function vehicleIcon(color: string, heading: number, selected: boolean): DivIcon {
  // El rumbo se redondea a 5° para reutilizar iconos y no romper la
  // transición CSS del marcador recreando el elemento en cada paquete
  const h = Math.round(heading / 5) * 5;
  const key = `${color}|${h}|${selected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const size = selected ? 46 : 34;
  const ring = selected
    ? `<circle cx="17" cy="17" r="15.5" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-opacity="0.4" stroke-width="1"/>`
    : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 34 34">
      ${ring}
      <g transform="rotate(${h} 17 17)">
        <path d="M17 5 L25 27 L17 22.5 L9 27 Z" fill="${color}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
      </g>
    </svg>`;
  const icon = divIcon({
    html: svg,
    className: "vehicle-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

function FlyToSelected({ vehicle }: { vehicle: Vehicle | null }) {
  const map = useMap();
  useEffect(() => {
    if (vehicle && vehicle.last_lat != null && vehicle.last_lon != null) {
      map.flyTo([vehicle.last_lat, vehicle.last_lon], Math.max(map.getZoom(), 15), {
        duration: 0.8,
      });
    }
    // Solo al cambiar de vehículo seleccionado, no en cada posición
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id]);
  return null;
}

function FollowController({
  vehicle,
  follow,
  onUserDrag,
}: {
  vehicle: Vehicle | null;
  follow: boolean;
  onUserDrag: () => void;
}) {
  const map = useMap();
  useMapEvent("dragstart", onUserDrag);
  useEffect(() => {
    if (follow && vehicle && vehicle.last_lat != null && vehicle.last_lon != null) {
      map.panTo([vehicle.last_lat, vehicle.last_lon], { animate: true });
    }
  }, [follow, vehicle, vehicle?.last_lat, vehicle?.last_lon, map]);
  return null;
}

interface Props {
  vehicles: Vehicle[];
  unackedIds: Set<string>;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  follow: boolean;
  onUserDrag: () => void;
  track?: TrackPoint[];
}

export function LiveMap({
  vehicles,
  unackedIds,
  now,
  selectedId,
  onSelect,
  follow,
  onUserDrag,
  track,
}: Props) {
  const selected = vehicles.find((v) => v.id === selectedId) ?? null;
  const trackLatLngs = (track ?? []).map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <MapContainer center={CARTAGENA} zoom={13} zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="bottomright" />
      <FlyToSelected vehicle={selected} />
      <FollowController vehicle={selected} follow={follow} onUserDrag={onUserDrag} />

      {trackLatLngs.length > 1 && (
        <>
          <Polyline
            positions={trackLatLngs}
            pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.75 }}
          />
          <CircleMarker
            center={trackLatLngs[0]}
            radius={5}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#16a34a", fillOpacity: 1 }}
          />
        </>
      )}

      {vehicles
        .filter((v) => v.last_lat != null && v.last_lon != null)
        .map((v) => {
          const status = vehicleStatus(v, unackedIds, now);
          return (
            <Marker
              key={v.id}
              position={[v.last_lat!, v.last_lon!]}
              icon={vehicleIcon(STATUS_META[status].color, v.last_direction ?? 0, v.id === selectedId)}
              eventHandlers={{ click: () => onSelect(v.id) }}
            >
              <LeafletTooltip className="vehicle-tooltip" direction="top" offset={[0, -16]}>
                {v.name || v.id}
              </LeafletTooltip>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
