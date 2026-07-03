import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Group,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { BellOff, Check, CheckCheck } from "lucide-react";
import { api } from "../../api/client";
import { useAlarms, useAckAlarm } from "../../api/alarms";
import { useVehicles } from "../../api/vehicles";
import { ALARM_LABELS } from "../../lib/status";
import { fmtDateTime, parseTs } from "../../lib/format";
import { ErrorState } from "../../components/States";

type StateFilter = "all" | "new" | "acked";

export default function EventsPage() {
  const alarmsQ = useAlarms();
  const vehiclesQ = useVehicles();
  const ack = useAckAlarm();
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [ackingAll, setAckingAll] = useState(false);

  const alarms = alarmsQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];
  const names = useMemo(() => new Map(vehicles.map((v) => [v.id, v.name || v.id])), [vehicles]);

  const filtered = useMemo(
    () =>
      alarms
        .filter((a) => (typeFilter ? a.alarm_type === typeFilter : true))
        .filter((a) => (vehicleFilter ? a.vehicle_id === vehicleFilter : true))
        .filter((a) =>
          stateFilter === "all" ? true : stateFilter === "new" ? !a.acknowledged : a.acknowledged,
        )
        .sort(
          (a, b) =>
            Number(a.acknowledged) - Number(b.acknowledged) ||
            parseTs(b.timestamp) - parseTs(a.timestamp),
        ),
    [alarms, typeFilter, vehicleFilter, stateFilter],
  );

  const unacked = useMemo(() => filtered.filter((a) => !a.acknowledged), [filtered]);

  const ackAllVisible = async () => {
    setAckingAll(true);
    try {
      // La API actual no tiene ack en lote (llega en Fase 3); se reconocen en serie
      for (const a of unacked) {
        await api.patch(`/api/alarms/${a.id}/acknowledge`);
      }
    } finally {
      setAckingAll(false);
      queryClient.invalidateQueries({ queryKey: ["alarms"] });
    }
  };

  if (alarmsQ.isError) return <ErrorState onRetry={() => alarmsQ.refetch()} />;

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="xs" wrap="wrap">
          <Select
            placeholder="Todos los tipos"
            clearable
            w={200}
            radius="md"
            value={typeFilter}
            onChange={setTypeFilter}
            data={Object.entries(ALARM_LABELS).map(([value, cfg]) => ({ value, label: cfg.label }))}
          />
          <Select
            placeholder="Todas las motos"
            clearable
            searchable
            w={220}
            radius="md"
            value={vehicleFilter}
            onChange={setVehicleFilter}
            data={vehicles.map((v) => ({ value: v.id, label: v.name || v.id }))}
          />
          <SegmentedControl
            size="xs"
            value={stateFilter}
            onChange={(v) => setStateFilter(v as StateFilter)}
            data={[
              { value: "all", label: "Todas" },
              { value: "new", label: "Nuevas" },
              { value: "acked", label: "Reconocidas" },
            ]}
          />
        </Group>
        {unacked.length > 0 && (
          <Button
            size="xs"
            variant="light"
            leftSection={<CheckCheck size={14} />}
            loading={ackingAll}
            onClick={ackAllVisible}
          >
            Reconocer visibles ({unacked.length})
          </Button>
        )}
      </Group>

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        {alarmsQ.isLoading ? (
          <Stack gap={8} p="md">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={44} radius="sm" />
            ))}
          </Stack>
        ) : filtered.length === 0 ? (
          <Stack align="center" py={48} gap={8}>
            <BellOff size={32} color="var(--text-faint)" strokeWidth={1.5} />
            <Text fw={600} fz={14}>
              Sin alertas con estos filtros
            </Text>
            <Text fz={12} c="dimmed">
              Ajusta los filtros o espera nuevas alertas del rastreador.
            </Text>
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Moto</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Ubicación</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th ta="right">Acción</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((a) => {
                  const cfg = ALARM_LABELS[a.alarm_type] ?? { label: a.alarm_type, color: "#ea580c" };
                  return (
                    <Table.Tr key={a.id} style={{ opacity: a.acknowledged ? 0.6 : 1 }}>
                      <Table.Td>
                        <Badge radius="sm" variant="light" style={{ background: `${cfg.color}14`, color: cfg.color }}>
                          {cfg.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          component={Link}
                          to={`/admin/devices/${a.vehicle_id}`}
                          fz={14}
                          fw={600}
                          c="var(--text)"
                          style={{ textDecoration: "none" }}
                        >
                          {names.get(a.vehicle_id) ?? a.vehicle_id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={13}>{fmtDateTime(a.timestamp)}</Text>
                      </Table.Td>
                      <Table.Td>
                        {a.lat != null && a.lon != null ? (
                          <Text fz={12} c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {a.lat.toFixed(4)}, {a.lon.toFixed(4)}
                          </Text>
                        ) : (
                          <Text fz={12} c="dimmed">
                            sin fix GPS
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {a.acknowledged ? (
                          <Group gap={4}>
                            <Check size={14} color="var(--text-faint)" />
                            <Text fz={12} c="dimmed">
                              Reconocida
                            </Text>
                          </Group>
                        ) : (
                          <Badge size="sm" color="red" variant="dot">
                            Nueva
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        {!a.acknowledged && (
                          <Button
                            size="compact-xs"
                            variant="light"
                            loading={ack.isPending && ack.variables === a.id}
                            onClick={() => ack.mutate(a.id)}
                          >
                            Reconocer
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>
    </Stack>
  );
}
