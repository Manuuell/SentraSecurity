import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Group,
  Loader,
  Popover,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Slider,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Info, Pause, Play, RotateCcw } from "lucide-react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { usePositions } from "../api/vehicles";
import { fmtDateTime, parseTs } from "../lib/format";
import { matchTrackToRoads } from "../lib/mapmatch";
import { vehicleIcon } from "./LiveMap";
import type { TrackPoint } from "../types";

const DAY_MS = 86_400_000;

/** Hueco temporal o salto espacial que parte el trazo en segmentos:
 *  evita las líneas rectas fantasma entre puntos no contiguos. */
const GAP_MS = 3 * 60 * 1000;
const GAP_KM = 0.8;

type Preset = "today" | "yesterday" | "7d" | "custom";

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function haversineKm(a: TrackPoint, b: TrackPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Radio (m) del ruido del GPS: por debajo de esto, un punto se considera la
 * misma parada, no movimiento. Una moto detenida no reporta la misma
 * coordenada: dispersa unos metros en cada lectura, y OSRM interpreta esa
 * dispersión como un recorrido (une los puntos por las calles). */
const MIN_MOVE_M = 20;

/** Descarta el "jitter" de GPS quieto: conserva un punto solo si se alejó más
 * de MIN_MOVE_M del último conservado. Así una moto detenida colapsa a un solo
 * punto y ni el trazo crudo ni el ajuste a vías fabrican una ruta falsa; los
 * viajes reales se conservan (sus puntos superan el umbral enseguida). */
function compactStationary(track: TrackPoint[]): TrackPoint[] {
  if (track.length < 2) return track;
  const out: TrackPoint[] = [track[0]];
  for (let i = 1; i < track.length; i += 1) {
    if (haversineKm(out[out.length - 1], track[i]) * 1000 >= MIN_MOVE_M) {
      out.push(track[i]);
    }
  }
  return out;
}

function FitTrack({ points }: { points: [number, number][] }) {
  const map = useMap();
  // Firma del trazo: re-encuadra al cambiar de rango o al llegar el ajuste a vías
  const signature = points.length
    ? `${points.length}|${points[0].join()}|${points[points.length - 1].join()}`
    : "";
  useEffect(() => {
    // El contenedor puede haber cambiado de tamaño (aparece la fila de resumen):
    // sin invalidateSize, Leaflet encuadra con las medidas viejas
    map.invalidateSize();
    if (points.length > 1) {
      map.fitBounds(points, { padding: [32, 32] });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);
  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text fz={11} c="dimmed" tt="uppercase" lts={0.4}>
        {label}
      </Text>
      <Text fz={15} fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
    </div>
  );
}

/** Histórico de recorrido con rango de fechas, ajuste a vías y reproducción.
 * Compartido entre el detalle de dispositivo del admin y la vista del cliente
 * en el mapa en vivo (el backend ya limita cada rol a sus vehículos). */
export function TrackHistory({ vehicleId, mapHeight = 420 }: { vehicleId: string; mapHeight?: number }) {
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Apagado por defecto: el ajuste a vías es útil solo cuando la moto se movió;
  // el usuario lo activa a propósito (ver el botón de info junto al switch).
  const [snap, setSnap] = useState(false);

  const [fromMs, toMs] = useMemo((): [number, number] => {
    const nowMs = Date.now();
    switch (preset) {
      case "today":
        return [startOfDayMs(nowMs), nowMs];
      case "yesterday":
        return [startOfDayMs(nowMs) - DAY_MS, startOfDayMs(nowMs)];
      case "7d":
        return [nowMs - 7 * DAY_MS, nowMs];
      case "custom": {
        const f = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : startOfDayMs(nowMs);
        const t = customTo ? new Date(`${customTo}T23:59:59`).getTime() : nowMs;
        return [f, Math.max(f, t)];
      }
    }
  }, [preset, customFrom, customTo]);

  const positionsQ = usePositions(vehicleId || null, fromMs, toMs);
  const track = useMemo(() => positionsQ.data ?? [], [positionsQ.data]);

  // Traza sin el ruido de GPS quieto: es la base de lo que se DIBUJA y se
  // ajusta a vías. Las estadísticas de abajo siguen usando la traza cruda.
  const movingTrack = useMemo(() => compactStationary(track), [track]);
  const hasMovement = movingTrack.length >= 2;

  // Trazo partido en segmentos donde hay huecos (sin líneas fantasma)
  const segments = useMemo(() => {
    const segs: TrackPoint[][] = [];
    let cur: TrackPoint[] = [];
    for (const p of movingTrack) {
      const prev = cur[cur.length - 1];
      if (
        prev &&
        (parseTs(p.timestamp) - parseTs(prev.timestamp) > GAP_MS || haversineKm(prev, p) > GAP_KM)
      ) {
        if (cur.length > 1) segs.push(cur);
        cur = [p];
      } else {
        cur.push(p);
      }
    }
    if (cur.length > 1) segs.push(cur);
    return segs;
  }, [movingTrack]);

  const rawSegments = useMemo(
    () => segments.map((seg) => seg.map((p) => [p.lat, p.lon] as [number, number])),
    [segments],
  );

  // Ajuste a la red vial (map matching); si el servicio falla, trazo crudo.
  // Se ajusta POR VIAJE (cada segmento entre huecos por separado): así las
  // ventanas de matching nunca cruzan huecos ni mezclan recorridos distintos.
  // La key se agrupa de a 30 puntos para no re-pedir con cada paquete del WS.
  const matchBucket = Math.floor(movingTrack.length / 30);
  const matchQ = useQuery({
    queryKey: ["match-roads", vehicleId, fromMs, toMs, matchBucket],
    queryFn: async () => {
      let matchedAny = false;
      const out: [number, number][][] = [];
      for (const seg of segments) {
        try {
          out.push(...(await matchTrackToRoads(seg)));
          matchedAny = true;
        } catch {
          // Este viaje cae al trazo crudo; los demás conservan su ajuste
          out.push(seg.map((p) => [p.lat, p.lon] as [number, number]));
        }
      }
      if (!matchedAny) throw new Error("OSRM no disponible");
      return out;
    },
    enabled: snap && hasMovement,
    staleTime: Infinity,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const displaySegments = snap && matchQ.data ? matchQ.data : rawSegments;
  const allPoints = useMemo(() => displaySegments.flat(), [displaySegments]);

  // Sin desplazamiento real, el mapa se centra en la última posición conocida
  // (la moto detenida) en vez de quedarse en la vista genérica de la ciudad.
  const restingLatLng = useMemo<[number, number] | null>(
    () => (track.length ? [track[track.length - 1].lat, track[track.length - 1].lon] : null),
    [track],
  );
  const fitPoints = allPoints.length > 0 ? allPoints : restingLatLng ? [restingLatLng] : [];

  // ── Reproducción ──────────────────────────────────────────────
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("4");

  useEffect(() => {
    setIdx(0);
    setPlaying(false);
  }, [track]);

  useEffect(() => {
    if (!playing || track.length < 2) return;
    const interval = window.setInterval(() => {
      setIdx((prev) => {
        if (prev >= track.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 900 / Number(speed));
    return () => window.clearInterval(interval);
  }, [playing, speed, track.length]);

  const current = track[Math.min(idx, track.length - 1)] as TrackPoint | undefined;

  const summary = useMemo(() => {
    if (track.length < 2) return null;
    // La distancia se suma solo dentro de cada segmento: los huecos no cuentan
    let km = 0;
    for (const seg of segments) {
      for (let i = 1; i < seg.length; i += 1) km += haversineKm(seg[i - 1], seg[i]);
    }
    let maxSpeed = 0;
    for (const p of track) {
      if (p.speed_kmh > maxSpeed) maxSpeed = p.speed_kmh;
    }
    return { km, maxSpeed, points: track.length };
  }, [track, segments]);

  return (
    <>
      <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
        <Text fw={700} fz={15}>
          Histórico de recorrido
        </Text>
        <Group gap="xs" wrap="wrap">
          <Group gap={4} wrap="nowrap">
            <Switch
              size="xs"
              label="Ajustar a vías"
              checked={snap}
              onChange={(e) => setSnap(e.currentTarget.checked)}
            />
            <Popover width={264} position="bottom" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  radius="xl"
                  aria-label="¿Qué es ajustar a vías?"
                >
                  <Info size={15} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Text fz={12} fw={700} mb={4}>
                  Ajustar a vías
                </Text>
                <Text fz={12} c="dimmed" lh={1.4}>
                  Pega el recorrido del GPS a las calles reales para que se vea limpio siguiendo las
                  vías, en vez de una línea quebrada. Útil cuando la moto se movió. Con la moto
                  detenida conviene dejarlo apagado: el ruido del GPS puede dibujar una ruta que no
                  ocurrió.
                </Text>
              </Popover.Dropdown>
            </Popover>
            {snap && matchQ.isFetching && <Loader size={14} />}
          </Group>
          <SegmentedControl
            size="xs"
            value={preset}
            onChange={(v) => setPreset(v as Preset)}
            data={[
              { value: "today", label: "Hoy" },
              { value: "yesterday", label: "Ayer" },
              { value: "7d", label: "7 días" },
              { value: "custom", label: "Rango" },
            ]}
          />
          {preset === "custom" && (
            <Group gap={6}>
              <TextInput
                type="date"
                size="xs"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.currentTarget.value)}
                aria-label="Desde"
              />
              <Text fz={12} c="dimmed">
                a
              </Text>
              <TextInput
                type="date"
                size="xs"
                value={customTo}
                onChange={(e) => setCustomTo(e.currentTarget.value)}
                aria-label="Hasta"
              />
            </Group>
          )}
        </Group>
      </Group>

      {snap && matchQ.isError && (
        <Text fz={11} c="dimmed" mb={8}>
          No se pudo ajustar el trazo a las vías (servicio no disponible); se muestra el recorrido
          GPS crudo.
        </Text>
      )}

      {summary && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="sm">
          <Stat label="Distancia" value={`${summary.km.toFixed(1)} km`} />
          <Stat label="Vel. máxima" value={`${Math.round(summary.maxSpeed)} km/h`} />
          <Stat label="Puntos GPS" value={`${summary.points}`} />
          <Stat
            label="Punto actual"
            value={current ? `${fmtDateTime(current.timestamp)} · ${Math.round(current.speed_kmh)} km/h` : "—"}
          />
        </SimpleGrid>
      )}

      <div style={{ height: mapHeight, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
        <MapContainer center={[10.391, -75.4794]} zoom={13} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <FitTrack points={fitPoints} />
          {displaySegments.map((seg, i) =>
            seg.length > 1 ? (
              <Polyline
                key={i}
                positions={seg}
                pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.75 }}
              />
            ) : null,
          )}
          {allPoints.length > 1 && (
            <>
              <CircleMarker
                center={allPoints[0]}
                radius={6}
                pathOptions={{ color: "#fff", weight: 2, fillColor: "#16a34a", fillOpacity: 1 }}
              />
              <CircleMarker
                center={allPoints[allPoints.length - 1]}
                radius={6}
                pathOptions={{ color: "#fff", weight: 2, fillColor: "#dc2626", fillOpacity: 1 }}
              />
            </>
          )}
          {hasMovement && current && (
            <Marker
              position={[current.lat, current.lon]}
              icon={vehicleIcon("#2563eb", current.direction ?? 0, true)}
            />
          )}
          {!hasMovement && restingLatLng && (
            <Marker
              position={restingLatLng}
              icon={vehicleIcon("#2563eb", track[track.length - 1]?.direction ?? 0, true)}
            />
          )}
        </MapContainer>
      </div>

      {/* Controles de reproducción */}
      {positionsQ.isLoading ? (
        <Skeleton h={40} mt="sm" radius="md" />
      ) : !hasMovement ? (
        <Text fz={13} c="dimmed" ta="center" py="md">
          {track.length >= 2
            ? "La moto estuvo detenida en este rango; no hay recorrido que reproducir."
            : "Sin recorrido registrado en este rango. Prueba otro rango de fechas."}
        </Text>
      ) : (
        <Group mt="sm" gap="sm" wrap="nowrap">
          <ActionIcon
            size={38}
            radius="xl"
            variant="filled"
            onClick={() => {
              if (idx >= track.length - 1) setIdx(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pausar" : "Reproducir"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </ActionIcon>
          <ActionIcon
            size={38}
            radius="xl"
            variant="default"
            onClick={() => {
              setPlaying(false);
              setIdx(0);
            }}
            aria-label="Reiniciar"
          >
            <RotateCcw size={15} />
          </ActionIcon>
          <Slider
            style={{ flex: 1 }}
            min={0}
            max={track.length - 1}
            value={idx}
            onChange={(v) => {
              setPlaying(false);
              setIdx(v);
            }}
            label={(v) => (track[v] ? fmtDateTime(track[v].timestamp) : "")}
          />
          <SegmentedControl
            size="xs"
            value={speed}
            onChange={setSpeed}
            data={[
              { value: "1", label: "1×" },
              { value: "4", label: "4×" },
              { value: "16", label: "16×" },
            ]}
          />
        </Group>
      )}
    </>
  );
}
