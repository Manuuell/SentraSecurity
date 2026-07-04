import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { KeyRound, Plus, UserCog } from "lucide-react";
import {
  useCreateUser,
  useResetPassword,
  useSetUserVehicles,
  useUpdateUser,
  useUserVehicles,
  useUsers,
} from "../../api/admin";
import { useVehicles } from "../../api/vehicles";
import { fmtDateTime } from "../../lib/format";
import { ErrorState } from "../../components/States";
import type { AdminUser, Role } from "../../types";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  operator: "Operador",
  client: "Cliente",
};

const ROLE_COLOR: Record<Role, string> = {
  admin: "grape",
  operator: "blue",
  client: "teal",
};

export default function UsersPage() {
  const usersQ = useUsers();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  if (usersQ.isError) return <ErrorState onRetry={() => usersQ.refetch()} />;

  const users = usersQ.data ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fz={14} c="dimmed">
          {users.length} {users.length === 1 ? "usuario" : "usuarios"}
        </Text>
        <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
          Nuevo usuario
        </Button>
      </Group>

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        {usersQ.isLoading ? (
          <Stack gap={8} p="md">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={44} radius="sm" />
            ))}
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Correo</Table.Th>
                  <Table.Th>Rol</Table.Th>
                  <Table.Th>Motos</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Alta</Table.Th>
                  <Table.Th ta="right">Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((u) => (
                  <Table.Tr
                    key={u.id}
                    onClick={() => setSelected(u)}
                    style={{ cursor: "pointer", opacity: u.is_active ? 1 : 0.55 }}
                  >
                    <Table.Td>
                      <Text fz={14} fw={600}>
                        {u.full_name || "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz={13}>{u.email}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={ROLE_COLOR[u.role]} radius="sm">
                        {ROLE_LABEL[u.role]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fz={13}>{u.role === "client" ? u.vehicle_count : "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      {u.is_active ? (
                        <Badge size="sm" color="green" variant="dot">
                          Activo
                        </Badge>
                      ) : (
                        <Badge size="sm" color="gray" variant="dot">
                          Inactivo
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text fz={12} c="dimmed">
                        {fmtDateTime(u.created_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" onClick={(e) => e.stopPropagation()}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => setSelected(u)}
                        aria-label={`Gestionar ${u.email}`}
                      >
                        <UserCog size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>

      <CreateUserModal opened={creating} onClose={() => setCreating(false)} />
      <ManageUserDrawer user={selected} onClose={() => setSelected(null)} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Alta de usuario
// ---------------------------------------------------------------------------

function CreateUserModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("client");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setEmail("");
      setFullName("");
      setPhone("");
      setRole("client");
      setPassword("");
      setError(null);
    }
  }, [opened]);

  const submit = () => {
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    create.mutate(
      { email: email.trim(), full_name: fullName.trim(), phone: phone.trim() || undefined, role, password },
      {
        onSuccess: onClose,
        onError: (err: unknown) => {
          const status = (err as { response?: { status?: number } }).response?.status;
          setError(
            status === 409
              ? "Ya existe un usuario con ese correo."
              : status === 422
                ? "Revisa el correo y la contraseña."
                : "No se pudo crear el usuario.",
          );
        },
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nuevo usuario" centered radius="lg">
      <Stack gap="sm">
        <TextInput
          label="Correo electrónico"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          data-autofocus
          required
        />
        <TextInput label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.currentTarget.value)} />
        <TextInput label="Teléfono" placeholder="+57 300 000 0000" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
        <Select
          label="Rol"
          data={[
            { value: "client", label: "Cliente (ve solo sus motos)" },
            { value: "operator", label: "Operador (monitorea toda la flota)" },
            { value: "admin", label: "Administrador (control total)" },
          ]}
          value={role}
          onChange={(v) => setRole((v as Role) ?? "client")}
          allowDeselect={false}
        />
        <PasswordInput
          label="Contraseña"
          description="Mínimo 8 caracteres. El cliente puede cambiarla luego."
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          required
        />
        {error && (
          <Text fz={12} c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end" gap="xs" mt={4}>
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Crear
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Gestión de un usuario (editar, asignar motos, reset)
// ---------------------------------------------------------------------------

function ManageUserDrawer({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const update = useUpdateUser();
  const setVehicles = useSetUserVehicles();
  const reset = useResetPassword();
  const vehiclesQ = useVehicles();
  const assignedQ = useUserVehicles(user?.id ?? null);

  const [assigned, setAssigned] = useState<string[]>([]);
  const [newPass, setNewPass] = useState("");
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    if (assignedQ.data) setAssigned(assignedQ.data);
  }, [assignedQ.data]);

  useEffect(() => {
    setNewPass("");
    setResetDone(false);
  }, [user?.id]);

  const vehicleOptions = useMemo(
    () =>
      (vehiclesQ.data ?? []).map((v) => ({
        value: v.id,
        label: `${v.name || v.id}${v.plate ? ` · ${v.plate}` : ""}`,
      })),
    [vehiclesQ.data],
  );

  if (!user) return <Drawer opened={false} onClose={onClose} position="right" />;

  const isClient = user.role === "client";

  return (
    <Drawer
      opened={user !== null}
      onClose={onClose}
      position="right"
      size={380}
      title={
        <div>
          <Text fw={700} fz={16}>
            {user.full_name || user.email}
          </Text>
          <Text fz={12} c="dimmed">
            {user.email}
          </Text>
        </div>
      }
    >
      <Stack gap="lg">
        {/* Rol y estado */}
        <Stack gap="sm">
          <Select
            label="Rol"
            data={[
              { value: "client", label: "Cliente" },
              { value: "operator", label: "Operador" },
              { value: "admin", label: "Administrador" },
            ]}
            value={user.role}
            onChange={(v) => v && update.mutate({ id: user.id, role: v as Role })}
            allowDeselect={false}
          />
          <Switch
            label="Cuenta activa"
            checked={user.is_active}
            onChange={(e) => update.mutate({ id: user.id, is_active: e.currentTarget.checked })}
          />
          {update.isError && (
            <Text fz={12} c="red">
              No se pudo aplicar el cambio (¿es tu propia cuenta de admin?).
            </Text>
          )}
        </Stack>

        {/* Asignación de motos (solo clientes) */}
        {isClient && (
          <Stack gap="sm">
            <Text fw={600} fz={14}>
              Motos asignadas
            </Text>
            <MultiSelect
              data={vehicleOptions}
              value={assigned}
              onChange={setAssigned}
              placeholder="Selecciona las motos del cliente"
              searchable
              nothingFoundMessage="Sin coincidencias"
              disabled={assignedQ.isLoading}
            />
            <Button
              variant="light"
              loading={setVehicles.isPending}
              disabled={assignedQ.isLoading}
              onClick={() => setVehicles.mutate({ id: user.id, vehicle_ids: assigned })}
            >
              Guardar asignación
            </Button>
          </Stack>
        )}

        {/* Reset de contraseña */}
        <Stack gap="sm">
          <Text fw={600} fz={14}>
            Restablecer contraseña
          </Text>
          <PasswordInput
            placeholder="Nueva contraseña (mín. 8)"
            leftSection={<KeyRound size={15} />}
            value={newPass}
            onChange={(e) => {
              setNewPass(e.currentTarget.value);
              setResetDone(false);
            }}
          />
          <Button
            variant="light"
            color="orange"
            disabled={newPass.length < 8}
            loading={reset.isPending}
            onClick={() =>
              reset.mutate(
                { id: user.id, new_password: newPass },
                { onSuccess: () => { setNewPass(""); setResetDone(true); } },
              )
            }
          >
            Restablecer
          </Button>
          {resetDone && (
            <Text fz={12} c="green">
              Contraseña actualizada.
            </Text>
          )}
        </Stack>
      </Stack>
    </Drawer>
  );
}
