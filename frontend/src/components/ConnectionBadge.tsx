import { Group, Paper, Text } from "@mantine/core";
import { useLiveStore } from "../realtime/liveStore";
import type { WsStatus } from "../types";

const META: Record<WsStatus, { color: string; label: string; pulse?: boolean }> = {
  connected: { color: "#16a34a", label: "En vivo" },
  connecting: { color: "#9ca3af", label: "Conectando…", pulse: true },
  reconnecting: { color: "#d97706", label: "Reconectando…", pulse: true },
  disconnected: { color: "#9ca3af", label: "Sin conexión" },
};

export function ConnectionBadge() {
  const wsStatus = useLiveStore((s) => s.wsStatus);
  const meta = META[wsStatus];
  return (
    <Paper radius="xl" px={12} py={6} shadow="sm" style={{ border: "1px solid var(--border)" }}>
      <Group gap={7} wrap="nowrap">
        <span
          className={meta.pulse ? "pulse" : undefined}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: meta.color,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <Text fz={12} fw={600} style={{ whiteSpace: "nowrap" }}>
          {meta.label}
        </Text>
      </Group>
    </Paper>
  );
}
