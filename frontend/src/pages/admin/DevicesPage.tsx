import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { Pencil, Plus, Radio, Search } from "lucide-react";
import { useNow } from "../../lib/useNow";
import { useVehicles, useUpdateVehicle } from "../../api/vehicles";
import { useAlarms } from "../../api/alarms";
import {
  useCreateVehicle,
  useSetVehicleUsers,
  useUsers,
  useVehicleOwners,
  type VehicleOwner,
} from "../../api/admin";
import { useAuth } from "../../auth/AuthProvider";
import { STATUS_META, vehicleStatus } from "../../lib/status";
import { fmtSpeed, timeAgo } from "../../lib/format";
import { EmptyState, ErrorState } from "../../components/States";
import type { Vehicle } from "../../types";

/** Opciones de clientes para los selects de vinculación (solo rol client). */
function useClientOptions(isAdmin: boolean) {
  const usersQ = useUsers(isAdmin);
  return useMemo(
    () =>
      (usersQ.data ?? [])
        .filter((u) => u.role === "client" && u.is_active)
        .map((u) => ({ value: String(u.id), label: u.full_name || u.email })),
    [usersQ.data],
  );
}

export default function DevicesPage() {
  const now = useNow();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";
  const vehiclesQ = useVehicles();
  const alarmsQ = useAlarms();
  const ownersQ = useVehicleOwners();
  const clientOptions = useClientOptions(isAdmin);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
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
        <Group gap="sm">
          <Text fz={13} c="dimmed">
            {filtered.length} de {vehicles.length}
          </Text>
          <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
            Nuevo rastreador
          </Button>
        </Group>
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
          <Table.ScrollContainer minWidth={880}>
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Moto</Table.Th>
                  <Table.Th>Cliente</Table.Th>
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
                        <OwnersCell owners={ownersQ.data?.[v.id]} />
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

      <CreateVehicleModal
        opened={creating}
        onClose={() => setCreating(false)}
        isAdmin={isAdmin}
        clientOptions={clientOptions}
      />
      <EditModal
        vehicle={editing}
        onClose={() => setEditing(null)}
        isAdmin={isAdmin}
        clientOptions={clientOptions}
        owners={editing ? ownersQ.data?.[editing.id] : undefined}
      />
    </Stack>
  );
}

function OwnersCell({ owners }: { owners?: VehicleOwner[] }) {
  if (!owners || owners.length === 0) {
    return (
      <Text fz={13} c="dimmed">
        Sin asignar
      </Text>
    );
  }
  const first = owners[0];
  return (
    <>
      <Text fz={13}>{first.full_name || first.email}</Text>
      {owners.length > 1 && (
        <Text fz={11} c="dimmed">
          +{owners.length - 1} más
        </Text>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Alta manual de un rastreador (con cliente opcional en el mismo paso)
// ---------------------------------------------------------------------------

function CreateVehicleModal({
  opened,
  onClose,
  isAdmin,
  clientOptions,
}: {
  opened: boolean;
  onClose: () => void;
  isAdmin: boolean;
  clientOptions: { value: string; label: string }[];
}) {
  const create = useCreateVehicle();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [simPhone, setSimPhone] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setId("");
      setName("");
      setPlate("");
      setSimPhone("");
      setOwnerId(null);
      setError(null);
    }
  }, [opened]);

  const idValido = /^\d{6,10}$/.test(id);

  const submit = () => {
    setError(null);
    create.mutate(
      {
        id,
        name: name.trim(),
        plate: plate.trim() || undefined,
        sim_phone: simPhone.trim() || undefined,
        owner_user_id: ownerId ? Number(ownerId) : undefined,
      },
      {
        onSuccess: onClose,
        onError: (err: unknown) => {
          const status = (err as { response?: { status?: number } }).response?.status;
          setError(
            status === 409
              ? "Ya existe un rastreador con ese ID."
              : status === 422
                ? "Revisa el ID: es el serial numérico del equipo."
                : "No se pudo crear el rastreador.",
          );
        },
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nuevo rastreador" centered radius="lg" className="ad-modal">
      <Stack gap="sm">
        <TextInput
          label="ID del rastreador"
          description="Serial numérico del equipo (el mismo que se usa al aprovisionar)"
          placeholder="9176761533"
          value={id}
          onChange={(e) => setId(e.currentTarget.value.replace(/\D/g, "").slice(0, 10))}
          data-autofocus
          required
        />
        <TextInput
          label="Nombre"
          placeholder="Moto de Carlos"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <TextInput
          label="Placa"
          placeholder="ABC12D"
          value={plate}
          onChange={(e) => setPlate(e.currentTarget.value.toUpperCase())}
        />
        <TextInput
          label="Teléfono de la SIM"
          description="Para los comandos por SMS (corte de motor)"
          placeholder="+57 300 000 0000"
          value={simPhone}
          onChange={(e) => setSimPhone(e.currentTarget.value)}
        />
        {isAdmin && (
          <Select
            label="Cliente"
            description="Queda vinculado desde el alta; puedes cambiarlo luego"
            placeholder="Sin asignar"
            data={clientOptions}
            value={ownerId}
            onChange={setOwnerId}
            searchable
            clearable
            nothingFoundMessage="Sin coincidencias"
          />
        )}
        {error && (
          <Text fz={12} c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end" gap="xs" mt={4}>
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!idValido}>
            Crear
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edición (datos del equipo + clientes vinculados)
// ---------------------------------------------------------------------------

function EditModal({
  vehicle,
  onClose,
  isAdmin,
  clientOptions,
  owners,
}: {
  vehicle: Vehicle | null;
  onClose: () => void;
  isAdmin: boolean;
  clientOptions: { value: string; label: string }[];
  owners?: VehicleOwner[];
}) {
  const update = useUpdateVehicle();
  const setUsers = useSetVehicleUsers();
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [assigned, setAssigned] = useState<string[]>([]);

  useEffect(() => {
    if (vehicle) {
      setName(vehicle.name);
      setPlate(vehicle.plate ?? "");
      setAssigned((owners ?? []).map((o) => String(o.id)));
    }
    // owners llega con el vehículo; solo reinicia al cambiar de vehículo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id]);

  const save = () => {
    if (!vehicle) return;
    const originales = (owners ?? []).map((o) => String(o.id)).sort().join(",");
    const nuevos = [...assigned].sort().join(",");
    update.mutate(
      { id: vehicle.id, name: name.trim(), plate: plate.trim() },
      {
        onSuccess: () => {
          if (isAdmin && nuevos !== originales) {
            setUsers.mutate(
              { id: vehicle.id, user_ids: assigned.map(Number) },
              { onSuccess: onClose },
            );
          } else {
            onClose();
          }
        },
      },
    );
  };

  const saving = update.isPending || setUsers.isPending;
  const failed = update.isError || setUsers.isError;

  return (
    <Modal opened={vehicle !== null} onClose={onClose} title="Editar dispositivo" centered radius="lg" className="ad-modal">
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
          {isAdmin && (
            <MultiSelect
              label="Clientes vinculados"
              description="Estos usuarios ven la moto en su cuenta"
              placeholder={assigned.length === 0 ? "Sin asignar" : undefined}
              data={clientOptions}
              value={assigned}
              onChange={setAssigned}
              searchable
              nothingFoundMessage="Sin coincidencias"
            />
          )}
          {failed && (
            <Text fz={12} c="red">
              No se pudo guardar. Intenta de nuevo.
            </Text>
          )}
          <Group justify="flex-end" gap="xs" mt={4}>
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
