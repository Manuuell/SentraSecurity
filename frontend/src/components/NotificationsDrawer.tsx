import { useMemo } from "react";
import { Badge, Button, Drawer, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  AlertTriangle,
  BatteryLow,
  BellOff,
  Check,
  CheckCheck,
  Gauge,
  LogIn,
  LogOut,
  MapPin,
  Move,
  Siren,
  type LucideIcon,
} from "lucide-react";
import type { Alarm, Vehicle } from "../types";
import { ALARM_LABELS } from "../lib/status";
import { fmtDateTime, parseTs, timeAgo } from "../lib/format";
import { useAckAlarm } from "../api/alarms";

interface Props {
  opened: boolean;
  onClose: () => void;
  alarms: Alarm[];
  vehicles: Vehicle[];
  now: number;
  /** Selecciona el vehículo en el mapa (el mapa vuela a él solo). */
  onSelectVehicle: (id: string) => void;
}

/** Icono por tipo de alarma; respaldo genérico para tipos que el equipo
 * pueda enviar y que aún no tengan uno propio. */
const ALARM_ICON: Record<string, LucideIcon> = {
  EMERGENCY: Siren,
  DISPLACEMENT: Move,
  VIBRATION: AlertTriangle,
  OVERSPEED: Gauge,
  LOW_BATTERY: BatteryLow,
  GEOFENCE_ENTER: LogIn,
  GEOFENCE_EXIT: LogOut,
};

/** Centro de notificaciones del usuario. Hoy se alimenta del flujo de alarmas
 * del rastreador (SOS, movimiento, vibración, exceso de velocidad, batería
 * baja); queda listo para sumar otros eventos (p. ej. corte de motor) cuando
 * el backend los emita. */
export function NotificationsDrawer({ opened, onClose, alarms, vehicles, now, onSelectVehicle }: Props) {
  const ack = useAckAlarm();

  const names = useMemo(() => new Map(vehicles.map((v) => [v.id, v.name || v.id])), [vehicles]);

  // No leídas primero; dentro de cada grupo, las más recientes arriba.
  const sorted = useMemo(
    () =>
      [...alarms].sort(
        (a, b) =>
          Number(a.acknowledged) - Number(b.acknowledged) ||
          parseTs(b.timestamp) - parseTs(a.timestamp),
      ),
    [alarms],
  );

  const unacked = useMemo(() => alarms.filter((a) => !a.acknowledged), [alarms]);

  const openVehicle = (id: string) => {
    onSelectVehicle(id);
    onClose();
  };

  const markAllRead = () => unacked.forEach((a) => ack.mutate(a.id));

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={380}
      // Por encima de los flotantes del mapa y del panel de detalle (z-index
      // 1000): con el default de Mantine (200) el drawer queda tapado por el
      // panel de detalle (mismo lado derecho) y "no se abre nada".
      zIndex={2000}
      title={
        <Group gap={8}>
          <Text fw={700} fz={16}>
            Notificaciones
          </Text>
          {unacked.length > 0 && (
            <Badge size="sm" color="red" variant="filled" radius="sm">
              {unacked.length} nuevas
            </Badge>
          )}
        </Group>
      }
    >
      {unacked.length > 0 && (
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<CheckCheck size={15} />}
          mb="sm"
          onClick={markAllRead}
          loading={ack.isPending}
        >
          Marcar todas como vistas
        </Button>
      )}

      {sorted.length === 0 ? (
        <Stack align="center" py={60} gap={8}>
          <BellOff size={32} color="var(--text-faint)" strokeWidth={1.5} />
          <Text fw={600} fz={14}>
            Sin notificaciones
          </Text>
          <Text fz={12} c="dimmed" ta="center">
            Las alertas del rastreador (SOS, movimiento, batería baja…) aparecerán aquí en tiempo real.
          </Text>
        </Stack>
      ) : (
        <Stack gap={8}>
          {sorted.map((a) => {
            const cfg = ALARM_LABELS[a.alarm_type] ?? { label: a.alarm_type, color: "#ea580c" };
            const Icon = ALARM_ICON[a.alarm_type] ?? Siren;
            const hasPos = a.lat != null && a.lon != null;
            return (
              <Paper
                key={a.id}
                p="sm"
                radius="md"
                style={{ border: "1px solid var(--border)", opacity: a.acknowledged ? 0.55 : 1 }}
              >
                <Group justify="space-between" align="flex-start" gap={8} wrap="nowrap">
                  <Group gap={10} align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
                    <div
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        display: "grid",
                        placeItems: "center",
                        background: `${cfg.color}14`,
                        color: cfg.color,
                      }}
                    >
                      <Icon size={17} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Badge radius="sm" variant="light" style={{ background: `${cfg.color}14`, color: cfg.color }}>
                        {cfg.label}
                      </Badge>
                      <UnstyledButton onClick={() => openVehicle(a.vehicle_id)} style={{ display: "block" }}>
                        <Text fz={13} fw={600} mt={6} truncate>
                          {names.get(a.vehicle_id) ?? a.vehicle_id}
                        </Text>
                      </UnstyledButton>
                      <Group gap={6} mt={2} wrap="nowrap">
                        <Text fz={11} c="dimmed">
                          {timeAgo(a.timestamp, now)}
                        </Text>
                        <Text fz={11} c="dimmed">
                          ·
                        </Text>
                        <Text fz={11} c="dimmed">
                          {fmtDateTime(a.timestamp)}
                        </Text>
                      </Group>
                      {hasPos && (
                        <UnstyledButton onClick={() => openVehicle(a.vehicle_id)} mt={6}>
                          <Group gap={4}>
                            <MapPin size={12} color="var(--accent)" />
                            <Text fz={11} fw={600} style={{ color: "var(--accent)" }}>
                              Ver en el mapa
                            </Text>
                          </Group>
                        </UnstyledButton>
                      )}
                    </div>
                  </Group>
                  {a.acknowledged ? (
                    <Group gap={4} style={{ flexShrink: 0 }}>
                      <Check size={14} color="var(--text-faint)" />
                      <Text fz={11} c="dimmed">
                        Vista
                      </Text>
                    </Group>
                  ) : (
                    <Button
                      size="compact-xs"
                      variant="light"
                      style={{ flexShrink: 0 }}
                      loading={ack.isPending && ack.variables === a.id}
                      onClick={() => ack.mutate(a.id)}
                    >
                      Marcar vista
                    </Button>
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Drawer>
  );
}
