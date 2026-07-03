import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useVehicles, usePositions } from "../../api/vehicles";
import { useAlarms } from "../../api/alarms";
import { useNow } from "../../lib/useNow";
import { STATUS_META, vehicleStatus } from "../../lib/status";
import { fmtDateTime, fmtSpeed, parseTs, timeAgo } from "../../lib/format";
import { matchTrackToRoads } from "../../lib/mapmatch";
import { vehicleIcon } from "../../components/LiveMap";
import { ErrorState } from "../../components/States";
import type { TrackPoint } from "../../types";

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

export default function DeviceDetailPage() {
  const { id = "" } = useParams();
  const now = useNow();
  const vehiclesQ = useVehicles();
  const alarmsQ = useAlarms();

  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [snap, setSnap] = useState(true);

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

  const positionsQ = usePositions(id || null, fromMs, toMs);
  const track = useMemo(() => positionsQ.data ?? [], [positionsQ.data]);

  // Trazo crudo partido en segmentos donde hay huecos (sin líneas fantasma)
  const segments = useMemo(() => {
    const segs: TrackPoint[][] = [];
    let cur: TrackPoint[] = [];
    for (const p of track) {
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
  }, [track]);

  const rawSegments = useMemo(
    () => segments.map((seg) => seg.map((p) => [p.lat, p.lon] as [number, number])),
    [segments],
  );

  // Ajuste a la red vial (map matching); si el servicio falla, trazo crudo.
  // Se ajusta POR VIAJE (cada segmento entre huecos por separado): así las
  // ventanas de matching nunca cruzan huecos ni mezclan recorridos distintos.
  // La key se agrupa de a 30 puntos para no re-pedir con cada paquete del WS.
  const matchBucket = Math.floor(track.length / 30);
  const matchQ = useQuery({
    queryKey: ["match-roads", id, fromMs, toMs, matchBucket],
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
    enabled: snap && track.length >= 2,
    staleTime: Infinity,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const displaySegments = snap && matchQ.data ? matchQ.data : rawSegments;
  const allPoints = useMemo(() => displaySegments.flat(), [displaySegments]);

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

  const vehicle = (vehiclesQ.data ?? []).find((v) => v.id === id) ?? null;
  const unackedIds = useMemo(
    () => new Set((alarmsQ.data ?? []).filter((a) => !a.acknowledged).map((a) => a.vehicle_id)),
    [alarmsQ.data],
  );

  if (vehiclesQ.isError) return <ErrorState onRetry={() => vehiclesQ.refetch()} />;
  if (vehiclesQ.isLoading) return <Skeleton h={400} radius="lg" />;
  if (!vehicle) {
    return (
      <div className="admin-card">
        <Text fw={600}>Dispositivo no encontrado</Text>
        <Text fz={13} c="dimmed" mt={4}>
          No existe un rastreador con ID {id}.
        </Text>
        <Button component={Link} to="/admin/devices" variant="light" mt="md" leftSection={<ArrowLeft size={14} />}>
          Volver a dispositivos
        </Button>
      </div>
    );
  }

  const status = vehicleStatus(vehicle, unackedIds, now);
  const meta = STATUS_META[status];

  return (
    <Stack gap="md">
      {/* Encabezado del dispositivo */}
      <div className="admin-card">
        <Group justify="space-between" wrap="wrap">
          <Group gap={12}>
            <ActionIcon component={Link} to="/admin/devices" variant="subtle" color="gray" aria-label="Volver">
              <ArrowLeft size={18} />
            </ActionIcon>
            <div>
              <Group gap={8}>
                <Text fw={700} fz={18}>
                  {vehicle.name || vehicle.id}
                </Text>
                {vehicle.plate && (
                  <Badge variant="default" radius="sm">
                    {vehicle.plate}
                  </Badge>
                )}
                <Badge radius="sm" variant="light" style={{ background: `${meta.color}14`, color: meta.color }}>
                  {meta.label}
                </Badge>
              </Group>
              <Text fz={12} c="dimmed" mt={2}>
                ID {vehicle.id} · {vehicle.iccid ?? "sin ICCID"} · última señal {timeAgo(vehicle.last_seen, now)}
              </Text>
            </div>
          </Group>
          <Group gap="lg">
            <Stat label="Velocidad" value={fmtSpeed(vehicle.last_speed)} />
            <Stat label="Batería" value={vehicle.battery_pct != null ? `${vehicle.battery_pct}%` : "—"} />
            <Stat label="Voltaje" value={vehicle.voltage != null ? `${vehicle.voltage.toFixed(1)} V` : "—"} />
            <Stat label="GSM" value={vehicle.gsm_signal != null ? `${vehicle.gsm_signal}/31` : "—"} />
            <Stat label="ACC" value={vehicle.acc_off === false ? "Encendido" : "Apagado"} />
          </Group>
        </Group>
      </div>

      {/* Histórico */}
      <div className="admin-card">
        <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
          <Text fw={700} fz={15}>
            Histórico de recorrido
          </Text>
          <Group gap="xs" wrap="wrap">
            <Group gap={6} wrap="nowrap">
              <Switch
                size="xs"
                label="Ajustar a vías"
                checked={snap}
                onChange={(e) => setSnap(e.currentTarget.checked)}
              />
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
            <Stat label="Distancia" value={`${summary.km.toFixed(1)} km`} big />
            <Stat label="Vel. máxima" value={`${Math.round(summary.maxSpeed)} km/h`} big />
            <Stat label="Puntos GPS" value={`${summary.points}`} big />
            <Stat
              label="Punto actual"
              value={current ? `${fmtDateTime(current.timestamp)} · ${Math.round(current.speed_kmh)} km/h` : "—"}
              big
            />
          </SimpleGrid>
        )}

        <div style={{ height: 420, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          <MapContainer center={[10.391, -75.4794]} zoom={13} zoomControl={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <FitTrack points={allPoints} />
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
            {current && (
              <Marker
                position={[current.lat, current.lon]}
                icon={vehicleIcon("#2563eb", current.direction ?? 0, true)}
              />
            )}
          </MapContainer>
        </div>

        {/* Controles de reproducción */}
        {positionsQ.isLoading ? (
          <Skeleton h={40} mt="sm" radius="md" />
        ) : track.length < 2 ? (
          <Text fz={13} c="dimmed" ta="center" py="md">
            Sin recorrido registrado en este rango. Prueba otro rango de fechas.
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
      </div>
    </Stack>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <Text fz={11} c="dimmed" tt="uppercase" lts={0.4}>
        {label}
      </Text>
      <Text fz={big ? 15 : 14} fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
    </div>
  );
}
