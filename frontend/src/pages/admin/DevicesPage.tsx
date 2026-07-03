import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { Pencil, Radio, Search } from "lucide-react";
import { useNow } from "../../lib/useNow";
import { useVehicles, useUpdateVehicle } from "../../api/vehicles";
import { useAlarms } from "../../api/alarms";
import { STATUS_META, vehicleStatus } from "../../lib/status";
import { fmtSpeed, timeAgo } from "../../lib/format";
import { EmptyState, ErrorState } from "../../components/States";
import type { Vehicle } from "../../types";

export default function DevicesPage() {
  const now = useNow();
  const navigate = useNavigate();
  const vehiclesQ = useVehicles();
  const alarmsQ = useAlarms();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const vehicles = vehiclesQ.data ?? [];
  const unackedIds = useMemo(
    () => new Set((alarmsQ.data ?? []).filter((a) => !a.acknowledged).map((a) => a.vehicle_id)),
    [alarmsQ.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? vehicles.filter(
          (v) =>
            (v.name || v.id).toLowerCase().includes(q) ||
            (v.plate ?? "").toLowerCase().includes(q) ||
            v.id.includes(q),
        )
      : vehicles;
    return [...rows].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [vehicles, query]);

  if (vehiclesQ.isError) return <ErrorState onRetry={() => vehiclesQ.refetch()} />;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <TextInput
          placeholder="Buscar por nombre, placa o ID"
          leftSection={<Search size={15} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={320}
          radius="md"
        />
        <Text fz={13} c="dimmed">
          {filtered.length} de {vehicles.length}
        </Text>
      </Group>

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        {vehiclesQ.isLoading ? (
          <Stack gap={8} p="md">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} h={44} radius="sm" />
            ))}
          </Stack>
        ) : filtered.length === 0 ? (
          <EmptyState searching={query.trim().length > 0} />
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Moto</Table.Th>
                  <Table.Th>Placa</Table.Th>
                  <Table.Th>ID / ICCID</Table.Th>
                  <Table.Th>Velocidad</Table.Th>
                  <Table.Th>Batería</Table.Th>
                  <Table.Th>Última señal</Table.Th>
                  <Table.Th ta="right">Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((v) => {
                  const status = vehicleStatus(v, unackedIds, now);
                  const meta = STATUS_META[status];
                  return (
                    <Table.Tr
                      key={v.id}
                      onClick={() => navigate(`/admin/devices/${v.id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td>
                        <Group gap={7} wrap="nowrap">
                          <span
                            className={status === "alarm" ? "pulse" : undefined}
                            style={{ width: 9, height: 9, borderRadius: "50%", background: meta.color }}
                          />
                          <Text fz={13} c={status === "offline" ? "dimmed" : undefined}>
                            {meta.label}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={14} fw={600}>
                          {v.name || v.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {v.plate ? (
                          <Badge variant="default" radius="sm">
                            {v.plate}
                          </Badge>
                        ) : (
                          <Text fz={13} c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text fz={13} style={{ fontVariantNumeric: "tabular-nums" }}>
                          {v.id}
                        </Text>
                        <Text fz={11} c="dimmed">
                          {v.iccid ?? "sin ICCID"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={13}>{fmtSpeed(v.last_speed)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={13}>{v.battery_pct != null ? `${v.battery_pct}%` : "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz={13} c={status === "offline" ? "dimmed" : undefined}>
                          {timeAgo(v.last_seen, now)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={() => setEditing(v)}
                            aria-label={`Editar ${v.name || v.id}`}
                          >
                            <Pencil size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            component={Link}
                            to={`/admin/provisioning?id=${v.id}`}
                            aria-label={`Aprovisionar ${v.id}`}
                          >
                            <Radio size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>

      <EditModal vehicle={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

function EditModal({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const update = useUpdateVehicle();
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");

  useEffect(() => {
    if (vehicle) {
      setName(vehicle.name);
      setPlate(vehicle.plate ?? "");
    }
  }, [vehicle]);

  const save = () => {
    if (!vehicle) return;
    update.mutate(
      { id: vehicle.id, name: name.trim(), plate: plate.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened={vehicle !== null} onClose={onClose} title="Editar dispositivo" centered radius="lg">
      {vehicle && (
        <Stack gap="sm">
          <TextInput label="ID del rastreador" value={vehicle.id} disabled />
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
      )}
    </Modal>
  );
}
