import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { Bell, Bike, SignalHigh, SignalZero, type LucideIcon } from "lucide-react";
import { useVehicles } from "../../api/vehicles";
import { useAlarms } from "../../api/alarms";
import { useNow } from "../../lib/useNow";
import { vehicleStatus, ALARM_LABELS } from "../../lib/status";
import { fmtDateTime } from "../../lib/format";
import { ErrorState } from "../../components/States";

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="admin-card">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fz={13} c="dimmed" fw={600}>
            {label}
          </Text>
          <Text fz={32} fw={800} mt={4} style={{ fontVariantNumeric: "tabular-nums" }}>
            {value}
          </Text>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: `${color}14`,
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon size={20} color={color} />
        </div>
      </Group>
    </div>
  );
}

export default function DashboardPage() {
  const now = useNow();
  const vehiclesQ = useVehicles();
  const alarmsQ = useAlarms();

  const vehicles = vehiclesQ.data ?? [];
  const alarms = alarmsQ.data ?? [];

  const unackedIds = useMemo(
    () => new Set(alarms.filter((a) => !a.acknowledged).map((a) => a.vehicle_id)),
    [alarms],
  );

  const stats = useMemo(() => {
    let online = 0;
    for (const v of vehicles) {
      if (vehicleStatus(v, unackedIds, now) !== "offline") online += 1;
    }
    return {
      total: vehicles.length,
      online,
      offline: vehicles.length - online,
      unacked: alarms.filter((a) => !a.acknowledged).length,
    };
  }, [vehicles, alarms, unackedIds, now]);

  const recent = useMemo(() => alarms.slice(0, 8), [alarms]);
  const names = useMemo(() => new Map(vehicles.map((v) => [v.id, v.name || v.id])), [vehicles]);

  if (vehiclesQ.isError) return <ErrorState onRetry={() => vehiclesQ.refetch()} />;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatCard icon={Bike} label="Motos totales" value={stats.total} color="#2563eb" />
        <StatCard icon={SignalHigh} label="En línea" value={stats.online} color="#16a34a" />
        <StatCard icon={SignalZero} label="Sin señal" value={stats.offline} color="#9ca3af" />
        <StatCard icon={Bell} label="Alertas sin reconocer" value={stats.unacked} color="#dc2626" />
      </SimpleGrid>

      <div className="admin-card">
        <Group justify="space-between" mb="sm">
          <Text fw={700} fz={15}>
            Alertas recientes
          </Text>
          <Text component={Link} to="/" fz={13} c="blue" fw={600} style={{ textDecoration: "none" }}>
            Ver en el mapa →
          </Text>
        </Group>
        {recent.length === 0 ? (
          <Text fz={13} c="dimmed" py="md">
            Sin alertas registradas.
          </Text>
        ) : (
          <Stack gap={0}>
            {recent.map((a) => {
              const cfg = ALARM_LABELS[a.alarm_type] ?? { label: a.alarm_type, color: "#ea580c" };
              return (
                <Group
                  key={a.id}
                  justify="space-between"
                  py={10}
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <Group gap={10}>
                    <Badge radius="sm" variant="light" style={{ background: `${cfg.color}14`, color: cfg.color }}>
                      {cfg.label}
                    </Badge>
                    <Text fz={14} fw={600}>
                      {names.get(a.vehicle_id) ?? a.vehicle_id}
                    </Text>
                  </Group>
                  <Group gap={12}>
                    <Text fz={12} c="dimmed">
                      {fmtDateTime(a.timestamp)}
                    </Text>
                    {!a.acknowledged && (
                      <Badge size="sm" color="red" variant="dot">
                        Nueva
                      </Badge>
                    )}
                  </Group>
                </Group>
              );
            })}
          </Stack>
        )}
      </div>
    </Stack>
  );
}
