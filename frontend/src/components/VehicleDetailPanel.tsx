import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CloseButton,
  Group,
  Image,
  Modal,
  Paper,
  Skeleton,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  BatteryMedium,
  Clock,
  Compass,
  Gauge,
  History,
  LocateFixed,
  Maximize2,
  Pencil,
  Power,
  Route,
  Satellite,
  Signal,
  Zap,
} from "lucide-react";
import type { Vehicle, VehicleStatus } from "../types";
import { STATUS_META } from "../lib/status";
import { fmtSpeed, timeAgo } from "../lib/format";
import { useUpdateVehicle, useVehicleStreetview } from "../api/vehicles";
import { loadGoogleMaps } from "../lib/googleMaps";
import { TrackHistory } from "./TrackHistory";

interface Props {
  vehicle: Vehicle;
  status: VehicleStatus;
  now: number;
  follow: boolean;
  onToggleFollow: () => void;
  showTrack: boolean;
  onToggleTrack: () => void;
  trackLoading: boolean;
  trackEmpty: boolean;
  onClose: () => void;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <Group gap={6} wrap="nowrap">
        {icon}
        <Text fz={11} c="dimmed" tt="uppercase" lts={0.4}>
          {label}
        </Text>
      </Group>
      <Text fz={14} fw={600} mt={2}>
        {value}
      </Text>
    </div>
  );
}

const iconProps = { size: 13, color: "var(--text-faint)" } as const;

/** Pin rojo superpuesto en el centro de una vista de calle. Es válido porque
 * la cámara (estática o interactiva) siempre se apunta hacia el punto del
 * GPS, así que el punto queda centrado en el encuadre. */
function CenterPin() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -100%)",
        pointerEvents: "none",
        filter: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45))",
        // Por encima de las capas internas del panorama de Google (z-index 1+),
        // que de lo contrario lo tapan en cuanto terminan de pintar.
        zIndex: 1000,
      }}
    >
      <svg width="38" height="38" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          fill="#EA4335"
          stroke="#fff"
          strokeWidth="1"
        />
        <circle cx="12" cy="9" r="2.5" fill="#fff" />
      </svg>
    </div>
  );
}

/** Versión estática (server-side, sin exponer key): usada cuando no hay
 * VITE_GOOGLE_MAPS_KEY configurada para el modo interactivo. */
function StaticStreetView({ vehicleId }: { vehicleId: string }) {
  const { data: blob, isLoading, isError } = useVehicleStreetview(vehicleId, true);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (isLoading) return <Skeleton h={180} radius="md" mt="md" />;
  if (isError || !url) return null;

  return (
    <Box pos="relative" mt="md">
      <Image src={url} h={180} radius="md" fit="cover" alt="Vista de calle de la última posición" />
      <CenterPin />
    </Box>
  );
}

/** Rumbo (0-360°, 0 = norte) desde `from` hacia `to`, para apuntar la cámara
 * de la panorámica al punto del GPS (que casi nunca coincide exactamente con
 * el punto desde donde Google capturó la foto de la calle). */
function bearingTo(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Distancia en metros entre dos puntos (haversine). */
function distanceMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Inclinación hacia abajo para que el punto del GPS (a nivel de suelo) quede
 * en cuadro: la cámara de Street View está a ~2.5m de altura, así que entre
 * más cerca esté el punto, más hay que mirar hacia abajo. */
function pitchTo(distance: number): number {
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const cameraHeight = 2.5;
  return -Math.min(60, toDeg(Math.atan2(cameraHeight, Math.max(distance, 3))));
}

/** Panorama interactivo (arrastrar/mirar alrededor) vía Google Maps JS,
 * cargado solo en el navegador con una key restringida por dominio. */
function InteractiveStreetView({ lat, lon, height = 180 }: { lat: number; lon: number; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // El Marker nativo de Google sobre un panorama no se pinta hasta la primera
  // interacción del usuario (bug conocido de la API, confirmado aquí en
  // producción tras varios intentos de forzar el repintado). Como la cámara se
  // apunta EXACTO al punto del GPS, el punto queda en el centro de la vista:
  // este pin propio cubre el hueco inicial y se oculta solo cuando detectamos
  // un arrastre real del usuario (pointer down + move) — momento en el que el
  // Marker nativo ya aparece solo. No sirve escuchar pov_changed: Google lo
  // dispara también durante la inicialización con POVs intermedios.
  const [showCenterPin, setShowCenterPin] = useState(true);
  const pointerDownRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setShowCenterPin(true);
    pointerDownRef.current = false;
    window.gm_authFailure = () => {
      if (!cancelled) setFailed(true);
    };

    const position = { lat, lng: lon };

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        new google.maps.StreetViewService().getPanorama({ location: position, radius: 60 }, (data, status) => {
          if (cancelled || !containerRef.current) return;
          if (status !== google.maps.StreetViewStatus.OK || !data?.location?.latLng) {
            setFailed(true);
            return;
          }
          const panoLatLng = data.location.latLng;
          const panoPos = { lat: panoLatLng.lat(), lng: panoLatLng.lng() };
          const pov = { heading: bearingTo(panoPos, position), pitch: pitchTo(distanceMeters(panoPos, position)) };
          const panorama = new google.maps.StreetViewPanorama(containerRef.current, {
            pano: data.location.pano,
            pov,
            addressControl: false,
            fullscreenControl: false,
            motionTracking: false,
          });
          // Se mantiene el Marker nativo porque, tras la primera interacción,
          // es él quien sigue el punto correctamente al mirar alrededor.
          // (AdvancedMarkerElement no es alternativa: no soporta Street View.)
          new google.maps.Marker({
            position,
            map: panorama,
            title: "Ubicación del GPS",
            optimized: false,
          });
          // Respaldo de la detección de arrastre: si Google captura los
          // eventos de puntero y los handlers de React no disparan, cualquier
          // cambio real de POV pasado el arranque también oculta el pin propio
          // (evita que se vean dos marcadores tras mover la vista). Los
          // eventos de inicialización quedan fuera por el periodo de gracia.
          window.setTimeout(() => {
            if (cancelled) return;
            panorama.addListener("pov_changed", () => {
              if (!cancelled) setShowCenterPin(false);
            });
          }, 1500);
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (failed) {
    return (
      <Text fz={13} c="dimmed" ta="center" py="xl">
        No se pudo cargar la vista interactiva.
      </Text>
    );
  }
  return (
    <div
      style={{ position: "relative", height, borderRadius: 12, overflow: "hidden" }}
      // Fase de captura: los eventos llegan aunque Google los maneje adentro.
      onPointerDownCapture={() => {
        pointerDownRef.current = true;
      }}
      onPointerMoveCapture={() => {
        if (pointerDownRef.current) setShowCenterPin(false);
      }}
      onPointerUpCapture={() => {
        pointerDownRef.current = false;
      }}
      onPointerCancelCapture={() => {
        pointerDownRef.current = false;
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {showCenterPin && <CenterPin />}
    </div>
  );
}

/** Miniatura estática siempre visible; si hay key de cliente y posición
 * conocida, se puede tocar para "entrar" al panorama interactivo en grande. */
function StreetViewPreview({ vehicle }: { vehicle: Vehicle }) {
  const hasClientKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY);
  const lat = vehicle.last_lat;
  const lon = vehicle.last_lon;
  const canExplore = hasClientKey && lat != null && lon != null;
  const [exploring, setExploring] = useState(false);
  // El panorama no puede inicializarse mientras el modal sigue animándose:
  // el transform de la transición rompe la proyección del marcador (queda
  // calculada con la geometría escalada y el pin no se pinta hasta que el
  // usuario mueve la vista). Se monta solo cuando la transición terminó.
  const [modalSettled, setModalSettled] = useState(false);

  useEffect(() => {
    if (!exploring) {
      setModalSettled(false);
      return;
    }
    const t = window.setTimeout(() => setModalSettled(true), 300);
    return () => window.clearTimeout(t);
  }, [exploring]);

  return (
    <>
      <Box
        pos="relative"
        h={180}
        mt="md"
        style={{ cursor: canExplore ? "pointer" : undefined }}
        onClick={canExplore ? () => setExploring(true) : undefined}
      >
        <StaticStreetView vehicleId={vehicle.id} />
        {canExplore && (
          <Badge
            leftSection={<Maximize2 size={11} />}
            variant="filled"
            color="dark"
            radius="sm"
            style={{ position: "absolute", right: 8, bottom: 8, pointerEvents: "none" }}
          >
            Ver en 360°
          </Badge>
        )}
      </Box>

      {hasClientKey && lat != null && lon != null && (
        <Modal
          opened={exploring}
          onClose={() => setExploring(false)}
          title={`Vista de calle — ${vehicle.name || vehicle.id}`}
          size="lg"
          centered
          radius="lg"
          zIndex={2000}
          transitionProps={{ duration: 200 }}
        >
          {modalSettled ? (
            <InteractiveStreetView lat={lat} lon={lon} height={420} />
          ) : (
            <Skeleton h={420} radius="md" />
          )}
        </Modal>
      )}
    </>
  );
}

export function VehicleDetailPanel({
  vehicle,
  status,
  now,
  follow,
  onToggleFollow,
  showTrack,
  onToggleTrack,
  trackLoading,
  trackEmpty,
  onClose,
}: Props) {
  const meta = STATUS_META[status];
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <Paper className="detail-panel" radius="lg" shadow="md" p="md" style={{ border: "1px solid var(--border)" }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text fw={700} fz={16} truncate>
              {vehicle.name || vehicle.id}
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label="Editar nombre y placa"
            >
              <Pencil size={14} />
            </ActionIcon>
          </Group>
          <Group gap={6} mt={4}>
            <Badge radius="sm" variant="light" style={{ background: `${meta.color}14`, color: meta.color }}>
              {meta.label}
            </Badge>
            {vehicle.plate && (
              <Badge radius="sm" variant="default" c="dimmed">
                {vehicle.plate}
              </Badge>
            )}
          </Group>
        </div>
        <CloseButton onClick={onClose} aria-label="Cerrar panel" />
      </Group>

      <SimpleGrid cols={2} spacing="sm" mt="md">
        <Metric icon={<Gauge {...iconProps} />} label="Velocidad" value={fmtSpeed(vehicle.last_speed)} />
        <Metric
          icon={<Compass {...iconProps} />}
          label="Rumbo"
          value={vehicle.last_direction != null ? `${vehicle.last_direction}°` : "—"}
        />
        <Metric
          icon={<BatteryMedium {...iconProps} />}
          label="Batería"
          value={vehicle.battery_pct != null ? `${vehicle.battery_pct}%` : "—"}
        />
        <Metric
          icon={<Zap {...iconProps} />}
          label="Voltaje"
          value={vehicle.voltage != null ? `${vehicle.voltage.toFixed(1)} V` : "—"}
        />
        <Metric
          icon={<Signal {...iconProps} />}
          label="Señal GSM"
          value={vehicle.gsm_signal != null ? `${vehicle.gsm_signal}/31` : "—"}
        />
        <Metric
          icon={<Satellite {...iconProps} />}
          label="Satélites"
          value={vehicle.satellites != null ? `${vehicle.satellites}` : "—"}
        />
        <Metric
          icon={<Power {...iconProps} />}
          label="Encendido (ACC)"
          value={vehicle.acc_off === false ? "Encendido" : "Apagado"}
        />
        <Metric icon={<Clock {...iconProps} />} label="Última señal" value={timeAgo(vehicle.last_seen, now)} />
      </SimpleGrid>

      <StreetViewPreview vehicle={vehicle} />

      <Group grow mt="md" gap="xs">
        <Button
          size="xs"
          radius="md"
          variant={follow ? "filled" : "light"}
          leftSection={<LocateFixed size={14} />}
          onClick={onToggleFollow}
        >
          {follow ? "Siguiendo" : "Seguir"}
        </Button>
        <Button
          size="xs"
          radius="md"
          variant={showTrack ? "filled" : "light"}
          leftSection={<Route size={14} />}
          loading={trackLoading}
          onClick={onToggleTrack}
        >
          Ruta de hoy
        </Button>
      </Group>

      {showTrack && !trackLoading && trackEmpty && (
        <Text fz={12} c="dimmed" mt={8} ta="center">
          Sin recorrido registrado hoy.
        </Text>
      )}

      <Button
        size="xs"
        radius="md"
        variant="light"
        fullWidth
        mt="xs"
        leftSection={<History size={14} />}
        onClick={() => setHistoryOpen(true)}
      >
        Ver histórico de recorrido
      </Button>

      {/* Histórico completo (rango de fechas + reproducción), el mismo del
          panel admin; el backend limita al cliente a sus propios vehículos */}
      <Modal
        opened={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`Histórico — ${vehicle.name || vehicle.id}`}
        size="xl"
        centered
        radius="lg"
        zIndex={2000}
        fullScreen={isMobile}
      >
        {historyOpen && <TrackHistory vehicleId={vehicle.id} mapHeight={isMobile ? 320 : 420} />}
      </Modal>

      <EditModal vehicle={vehicle} opened={editing} onClose={() => setEditing(false)} />
    </Paper>
  );
}

function EditModal({ vehicle, opened, onClose }: { vehicle: Vehicle; opened: boolean; onClose: () => void }) {
  const update = useUpdateVehicle();
  const [name, setName] = useState(vehicle.name);
  const [plate, setPlate] = useState(vehicle.plate ?? "");

  useEffect(() => {
    if (opened) {
      setName(vehicle.name);
      setPlate(vehicle.plate ?? "");
    }
  }, [opened, vehicle]);

  const save = () =>
    update.mutate({ id: vehicle.id, name: name.trim(), plate: plate.trim() }, { onSuccess: onClose });

  return (
    <Modal opened={opened} onClose={onClose} title="Editar vehículo" centered radius="lg">
      <Stack gap="sm">
        <TextInput label="Nombre" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <TextInput
          label="Placa"
          placeholder="ABC12D"
          value={plate}
          onChange={(e) => setPlate(e.currentTarget.value.toUpperCase())}
        />
        {update.isError && (
          <Text fz={12} c="red">
            No se pudo guardar. Intenta de nuevo.
          </Text>
        )}
        <Group justify="flex-end" gap="xs" mt={4}>
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
