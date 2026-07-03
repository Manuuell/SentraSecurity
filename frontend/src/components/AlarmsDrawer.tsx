import { useMemo } from "react";
import { Badge, Button, Drawer, Group, Paper, Stack, Text } from "@mantine/core";
import { BellOff, Check } from "lucide-react";
import type { Alarm, Vehicle } from "../types";
import { ALARM_LABELS } from "../lib/status";
import { fmtDateTime, parseTs } from "../lib/format";
import { useAckAlarm } from "../api/alarms";

interface Props {
  opened: boolean;
  onClose: () => void;
  alarms: Alarm[];
  vehicles: Vehicle[];
}

export function AlarmsDrawer({ opened, onClose, alarms, vehicles }: Props) {
  const ack = useAckAlarm();

  const names = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v.name || v.id])),
    [vehicles],
  );

  const sorted = useMemo(
    () =>
      [...alarms].sort(
        (a, b) =>
          Number(a.acknowledged) - Number(b.acknowledged) ||
          parseTs(b.timestamp) - parseTs(a.timestamp),
      ),
    [alarms],
  );

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={360}
      title={
        <Text fw={700} fz={16}>
          Alertas
        </Text>
      }
    >
      {sorted.length === 0 ? (
        <Stack align="center" py={60} gap={8}>
          <BellOff size={32} color="var(--text-faint)" strokeWidth={1.5} />
          <Text fw={600} fz={14}>
            Sin alertas
          </Text>
          <Text fz={12} c="dimmed" ta="center">
            Las alertas del rastreador aparecerán aquí en tiempo real.
          </Text>
        </Stack>
      ) : (
        <Stack gap={8}>
          {sorted.map((a) => {
            const cfg = ALARM_LABELS[a.alarm_type] ?? { label: a.alarm_type, color: "#ea580c" };
            return (
              <Paper
                key={a.id}
                p="sm"
                radius="md"
                style={{ border: "1px solid var(--border)", opacity: a.acknowledged ? 0.55 : 1 }}
              >
                <Group justify="space-between" align="flex-start" gap={8} wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Badge radius="sm" variant="light" style={{ background: `${cfg.color}14`, color: cfg.color }}>
                      {cfg.label}
                    </Badge>
                    <Text fz={13} fw={600} mt={6} truncate>
                      {names.get(a.vehicle_id) ?? a.vehicle_id}
                    </Text>
                    <Text fz={11} c="dimmed">
                      {fmtDateTime(a.timestamp)}
                    </Text>
                  </div>
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
                      Reconocer
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
