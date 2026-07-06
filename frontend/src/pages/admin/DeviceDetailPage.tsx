import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ActionIcon, Badge, Button, Group, Skeleton, Stack, Text } from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import { useVehicles } from "../../api/vehicles";
import { useAlarms } from "../../api/alarms";
import { useNow } from "../../lib/useNow";
import { STATUS_META, vehicleStatus } from "../../lib/status";
import { fmtSpeed, timeAgo } from "../../lib/format";
import { ErrorState } from "../../components/States";
import { TrackHistory } from "../../components/TrackHistory";
import { VehicleCommandsPanel } from "../../components/VehicleCommandsPanel";

export default function DeviceDetailPage() {
  const { id = "" } = useParams();
  const now = useNow();
  const vehiclesQ = useVehicles();
  const alarmsQ = useAlarms();

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

      {/* Histórico (componente compartido con la vista del cliente) */}
      <div className="admin-card">
        <TrackHistory vehicleId={id} />
      </div>

      <VehicleCommandsPanel vehicle={vehicle} />
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text fz={11} c="dimmed" tt="uppercase" lts={0.4}>
        {label}
      </Text>
      <Text fz={14} fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
    </div>
  );
}
