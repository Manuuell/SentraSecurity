import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Group,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { LogOut, Search } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import type { Vehicle } from "../types";
import { vehicleStatus } from "../lib/status";
import { fmtTime } from "../lib/format";
import { VehicleListItem } from "./VehicleListItem";
import { EmptyState, ErrorState } from "./States";

interface Props {
  vehicles: Vehicle[];
  unackedIds: Set<string>;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  lastPacketAt: string | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function Sidebar({
  vehicles,
  unackedIds,
  now,
  selectedId,
  onSelect,
  lastPacketAt,
  isLoading,
  isError,
  onRetry,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(
      (v) =>
        (v.name || v.id).toLowerCase().includes(q) ||
        (v.plate ?? "").toLowerCase().includes(q),
    );
  }, [vehicles, query]);

  const onlineCount = useMemo(
    () => vehicles.filter((v) => vehicleStatus(v, unackedIds, now) !== "offline").length,
    [vehicles, unackedIds, now],
  );

  return (
    <Stack gap={0} h="100%" style={{ background: "var(--surface)" }}>
      <Group gap={10} p="md" style={{ borderBottom: "1px solid var(--border)" }} wrap="nowrap">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--accent-soft)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <img src="/logo-mark.png" alt="SentraSecurity" width={20} height={20} />
        </div>
        <div>
          <Text fw={800} fz={15} lh={1.2}>
            SentraSecurity
          </Text>
          <Text fz={11} c="dimmed">
            Monitoreo GPS · Cartagena
          </Text>
        </div>
      </Group>

      <Stack gap={8} p="md" pb="xs">
        <TextInput
          placeholder="Buscar por nombre o placa"
          leftSection={<Search size={15} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          radius="md"
          aria-label="Buscar vehículo"
        />
        <Group gap={8}>
          <Badge variant="light" color="green" radius="sm">
            {onlineCount} en línea
          </Badge>
          <Badge variant="light" color="gray" radius="sm">
            {vehicles.length - onlineCount} sin señal
          </Badge>
        </Group>
      </Stack>

      <ScrollArea style={{ flex: 1 }} px="xs">
        {isLoading ? (
          <Stack gap={8} p="xs">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} h={56} radius="md" />
            ))}
          </Stack>
        ) : isError ? (
          <ErrorState onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <EmptyState searching={query.trim().length > 0} />
        ) : (
          filtered.map((v) => (
            <VehicleListItem
              key={v.id}
              vehicle={v}
              status={vehicleStatus(v, unackedIds, now)}
              selected={v.id === selectedId}
              now={now}
              onClick={() => onSelect(v.id)}
            />
          ))
        )}
      </ScrollArea>

      <Group justify="space-between" px="md" py={8} style={{ borderTop: "1px solid var(--border)" }}>
        <Text fz={11} c="dimmed">
          {vehicles.length} {vehicles.length === 1 ? "moto" : "motos"}
        </Text>
        <Text fz={11} c="dimmed">
          {lastPacketAt ? `Último paquete ${fmtTime(lastPacketAt)}` : "Sin paquetes aún"}
        </Text>
      </Group>

      <SessionFooter />
    </Stack>
  );
}

function SessionFooter() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Group
      justify="space-between"
      px="md"
      py={10}
      style={{ borderTop: "1px solid var(--border)" }}
      wrap="nowrap"
    >
      <div style={{ minWidth: 0 }}>
        <Text fz={13} fw={600} truncate>
          {user.full_name || user.email}
        </Text>
        <Text fz={11} c="dimmed" tt="capitalize">
          {user.role === "client" ? "Cliente" : user.role === "operator" ? "Operador" : "Administrador"}
        </Text>
      </div>
      <Tooltip label="Cerrar sesión">
        <ActionIcon variant="subtle" color="gray" onClick={() => logout()} aria-label="Cerrar sesión">
          <LogOut size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
