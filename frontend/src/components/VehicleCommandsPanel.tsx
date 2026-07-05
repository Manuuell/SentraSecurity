import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Check, Copy, Power, PowerOff, TriangleAlert } from "lucide-react";
import { useCreateCommand, useUpdateCommandStatus, useVehicleCommands } from "../api/commands";
import { useUpdateVehicle } from "../api/vehicles";
import { fmtDateTime } from "../lib/format";
import type { CommandType, Vehicle } from "../types";

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "gray" },
  sent: { label: "Enviado", color: "blue" },
  confirmed: { label: "Confirmado", color: "green" },
  failed: { label: "Falló", color: "red" },
  expired: { label: "Expiró", color: "orange" },
};

const TYPE_LABEL: Record<CommandType, string> = {
  ENGINE_STOP: "Cortar motor",
  ENGINE_RESUME: "Restaurar motor",
};

const ACTIVE_STATUSES = new Set(["pending", "sent"]);

export function VehicleCommandsPanel({ vehicle }: { vehicle: Vehicle }) {
  const commandsQ = useVehicleCommands(vehicle.id);
  const create = useCreateCommand(vehicle.id);
  const updateStatus = useUpdateCommandStatus(vehicle.id);

  const [confirmType, setConfirmType] = useState<CommandType | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [configOpen, setConfigOpen] = useState(false);

  const commands = commandsQ.data ?? [];
  const active = commands.find((c) => ACTIVE_STATUSES.has(c.status)) ?? null;
  const configured = Boolean(vehicle.sim_phone) && vehicle.has_command_password;
  const expectedConfirm = (vehicle.plate ?? vehicle.id).toUpperCase();

  const requestCommand = () => {
    if (!confirmType) return;
    create.mutate(confirmType, {
      onSuccess: () => {
        setConfirmType(null);
        setConfirmInput("");
      },
    });
  };

  return (
    <div className="admin-card">
      <Group justify="space-between" mb={configured ? "sm" : 8}>
        <Text fw={700} fz={15}>
          Seguridad
        </Text>
        <Button size="compact-xs" variant="subtle" onClick={() => setConfigOpen(true)}>
          {configured ? "Editar canal SMS" : "Configurar canal SMS"}
        </Button>
      </Group>

      {!configured && (
        <Alert color="yellow" icon={<TriangleAlert size={15} />} p="sm" mb="sm">
          Configura el teléfono del SIM y la contraseña del equipo para poder enviar comandos de
          corte de motor.
        </Alert>
      )}

      <Group grow gap="xs" mb={active ? "sm" : 0}>
        <Button
          color="red"
          variant="light"
          leftSection={<PowerOff size={16} />}
          disabled={active !== null}
          onClick={() => setConfirmType("ENGINE_STOP")}
        >
          Cortar motor
        </Button>
        <Button
          color="green"
          variant="light"
          leftSection={<Power size={16} />}
          disabled={active !== null}
          onClick={() => setConfirmType("ENGINE_RESUME")}
        >
          Restaurar motor
        </Button>
      </Group>

      {active && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <Group justify="space-between" mb={8}>
            <Text fz={13} fw={700}>
              {TYPE_LABEL[active.type]} — en curso
            </Text>
            <Badge color={STATUS_META[active.status].color} size="sm">
              {STATUS_META[active.status].label}
            </Badge>
          </Group>

          {active.sms_text ? (
            <>
              <Text fz={11} c="dimmed" mb={4}>
                Envía este SMS a {active.sms_phone ?? "el teléfono del equipo"}:
              </Text>
              <Group gap={6} mb={10}>
                <Code style={{ fontSize: 14 }}>{active.sms_text}</Code>
                <CopyButton value={active.sms_text}>
                  {({ copied, copy }) => (
                    <ActionIcon size="sm" variant="subtle" color={copied ? "green" : "gray"} onClick={copy}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </ActionIcon>
                  )}
                </CopyButton>
              </Group>
            </>
          ) : (
            <Text fz={12} c="dimmed" mb={10}>
              Sin canal configurado: envía manualmente el comando correspondiente al equipo.
            </Text>
          )}

          <Group gap={6}>
            {active.status === "pending" && (
              <Button
                size="compact-xs"
                variant="light"
                loading={updateStatus.isPending}
                onClick={() => updateStatus.mutate({ id: active.id, status: "sent" })}
              >
                Ya lo envié
              </Button>
            )}
            <Button
              size="compact-xs"
              color="green"
              variant="light"
              loading={updateStatus.isPending}
              onClick={() => updateStatus.mutate({ id: active.id, status: "confirmed" })}
            >
              Recibí SET OK
            </Button>
            <Button
              size="compact-xs"
              color="red"
              variant="subtle"
              loading={updateStatus.isPending}
              onClick={() => updateStatus.mutate({ id: active.id, status: "failed", error: "Sin respuesta del equipo" })}
            >
              No funcionó
            </Button>
          </Group>
        </div>
      )}

      {commands.length > 0 && (
        <Stack gap={6}>
          <Text fz={11} c="dimmed" tt="uppercase" fw={700} lts={0.3}>
            Historial
          </Text>
          {commands.slice(0, 5).map((c) => (
            <Group key={c.id} justify="space-between">
              <Text fz={12}>{TYPE_LABEL[c.type]}</Text>
              <Group gap={8}>
                <Text fz={11} c="dimmed">
                  {fmtDateTime(c.created_at)}
                </Text>
                <Badge size="xs" variant="light" color={STATUS_META[c.status].color}>
                  {STATUS_META[c.status].label}
                </Badge>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      {/* Confirmación fuerte: escribir la placa/ID antes de ejecutar */}
      <Modal
        opened={confirmType !== null}
        onClose={() => setConfirmType(null)}
        title={confirmType ? TYPE_LABEL[confirmType] : ""}
        centered
        radius="lg"
      >
        <Stack gap="sm">
          <Text fz={13} c="dimmed">
            {confirmType === "ENGINE_STOP"
              ? "La moto no podrá encender hasta que restaures el motor."
              : "El motor volverá a funcionar con normalidad."}{" "}
            Escribe <b>{expectedConfirm}</b> para confirmar.
          </Text>
          <TextInput
            placeholder={expectedConfirm}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.currentTarget.value.toUpperCase())}
            data-autofocus
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => setConfirmType(null)}>
              Cancelar
            </Button>
            <Button
              color={confirmType === "ENGINE_STOP" ? "red" : "green"}
              disabled={confirmInput.trim() !== expectedConfirm}
              loading={create.isPending}
              onClick={requestCommand}
            >
              Confirmar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ChannelConfigModal vehicle={vehicle} opened={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}

function ChannelConfigModal({
  vehicle,
  opened,
  onClose,
}: {
  vehicle: Vehicle;
  opened: boolean;
  onClose: () => void;
}) {
  const update = useUpdateVehicle();
  const [simPhone, setSimPhone] = useState(vehicle.sim_phone ?? "");
  const [password, setPassword] = useState("");

  return (
    <Modal opened={opened} onClose={onClose} title="Canal de comandos SMS" centered radius="lg">
      <Stack gap="sm">
        <TextInput
          label="Teléfono del SIM"
          placeholder="+573001112233"
          value={simPhone}
          onChange={(e) => setSimPhone(e.currentTarget.value)}
        />
        <TextInput
          label="Contraseña del equipo"
          description={vehicle.has_command_password ? "Ya configurada — déjala vacía para no cambiarla." : "De fábrica suele ser 0000."}
          placeholder="0000"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        {update.isError && (
          <Text fz={12} c="red">
            No se pudo guardar. Intenta de nuevo.
          </Text>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { id: vehicle.id, sim_phone: simPhone.trim(), ...(password.trim() ? { command_password: password.trim() } : {}) },
                { onSuccess: onClose },
              )
            }
          >
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
