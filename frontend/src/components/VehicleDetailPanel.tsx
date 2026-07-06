import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActionIcon,
  Badge,
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
import {
  BatteryMedium,
  Clock,
  Compass,
  Gauge,
  LocateFixed,
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
    <Image
      src={url}
      h={180}
      radius="md"
      mt="md"
      fit="cover"
      alt="Vista de calle de la última posición"
    />
  );
}

/** Panorama interactivo (arrastrar/mirar alrededor) vía Google Maps JS,
 * cargado solo en el navegador con una key restringida por dominio. */
function InteractiveStreetView({ lat, lon }: { lat: number; lon: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    window.gm_authFailure = () => {
      if (!cancelled) setFailed(true);
    };

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const position = { lat, lng: lon };
        new google.maps.StreetViewPanorama(containerRef.current, {
          position,
          pov: { heading: 0, pitch: 0 },
          addressControl: false,
          fullscreenControl: false,
          motionTracking: false,
        });
        new google.maps.StreetViewService().getPanorama({ location: position, radius: 60 }, (_, status) => {
          if (!cancelled && status !== google.maps.StreetViewStatus.OK) setFailed(true);
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (failed) return null;
  return <div ref={containerRef} style={{ height: 180, borderRadius: 12, overflow: "hidden", marginTop: 16 }} />;
}

function StreetViewPreview({ vehicle }: { vehicle: Vehicle }) {
  const hasClientKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY);
  if (hasClientKey && vehicle.last_lat != null && vehicle.last_lon != null) {
    return <InteractiveStreetView lat={vehicle.last_lat} lon={vehicle.last_lon} />;
  }
  return <StaticStreetView vehicleId={vehicle.id} />;
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
