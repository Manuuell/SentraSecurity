import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ActionIcon, Badge, Button, Group, Paper, Skeleton, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { ArrowLeft } from "lucide-react";
import { useVehicles } from "../api/vehicles";
import { useAlarms } from "../api/alarms";
import { useNow } from "../lib/useNow";
import { STATUS_META, vehicleStatus } from "../lib/status";
import { timeAgo } from "../lib/format";
import { ErrorState } from "../components/States";
import { TrackHistory } from "../components/TrackHistory";

/** Histórico de recorrido como página propia (no modal), abierta desde el
 * panel del vehículo en el mapa en vivo. El backend limita cada rol a sus
 * vehículos, así que sirve tanto al cliente como al admin/operador. */
export default function VehicleHistoryPage() {
  const { id = "" } = useParams();
  const now = useNow();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const vehiclesQ = useVehicles();
  const alarmsQ = useAlarms();

  const vehicle = (vehiclesQ.data ?? []).find((v) => v.id === id) ?? null;
  const unackedIds = useMemo(
    () => new Set((alarmsQ.data ?? []).filter((a) => !a.acknowledged).map((a) => a.vehicle_id)),
    [alarmsQ.data],
  );

  const body = () => {
    if (vehiclesQ.isError) return <ErrorState onRetry={() => vehiclesQ.refetch()} />;
    if (vehiclesQ.isLoading) return <Skeleton h={480} radius="lg" />;
    if (!vehicle) {
      return (
        <Paper withBorder radius="lg" p="lg">
          <Text fw={600}>Vehículo no encontrado</Text>
          <Text fz={13} c="dimmed" mt={4}>
            No existe un vehículo con ID {id} entre los tuyos.
          </Text>
          <Button component={Link} to="/" variant="light" mt="md" leftSection={<ArrowLeft size={14} />}>
            Volver al mapa
          </Button>
        </Paper>
      );
    }

    const status = vehicleStatus(vehicle, unackedIds, now);
    const meta = STATUS_META[status];

    return (
      <>
        <Group gap={12} wrap="nowrap" align="flex-start">
          <ActionIcon component={Link} to="/" variant="subtle" color="gray" size="lg" aria-label="Volver al mapa">
            <ArrowLeft size={20} />
          </ActionIcon>
          <div style={{ minWidth: 0 }}>
            <Group gap={8} wrap="wrap">
              <Text fw={700} fz={20} truncate>
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
              Última señal {timeAgo(vehicle.last_seen, now)}
            </Text>
          </div>
        </Group>

        <Paper withBorder radius="lg" p="md" mt="md">
          <TrackHistory vehicleId={id} mapHeight={isMobile ? 340 : 460} />
        </Paper>
      </>
    );
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>{body()}</div>
    </div>
  );
}
