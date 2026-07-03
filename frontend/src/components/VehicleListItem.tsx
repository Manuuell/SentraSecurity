import { Text, UnstyledButton } from "@mantine/core";
import { BatteryMedium } from "lucide-react";
import type { Vehicle, VehicleStatus } from "../types";
import { STATUS_META } from "../lib/status";
import { fmtSpeed, timeAgo } from "../lib/format";

interface Props {
  vehicle: Vehicle;
  status: VehicleStatus;
  selected: boolean;
  now: number;
  onClick: () => void;
}

export function VehicleListItem({ vehicle, status, selected, now, onClick }: Props) {
  const meta = STATUS_META[status];
  const subtitle =
    status === "offline" ? `Visto ${timeAgo(vehicle.last_seen, now)}` : meta.label;

  return (
    <UnstyledButton
      onClick={onClick}
      w="100%"
      px="sm"
      py={10}
      my={2}
      aria-label={`Seleccionar ${vehicle.name || vehicle.id}`}
      style={{
        borderRadius: 12,
        background: selected ? "var(--accent-soft)" : "transparent",
        border: selected ? "1px solid #dbeafe" : "1px solid transparent",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        className={status === "alarm" ? "pulse" : undefined}
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: meta.color,
          flexShrink: 0,
          boxShadow: status === "alarm" ? "0 0 0 4px rgba(220, 38, 38, 0.12)" : undefined,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text fz={14} fw={600} truncate>
          {vehicle.name || vehicle.id}
        </Text>
        <Text fz={12} c="dimmed" truncate>
          {vehicle.plate ? `${vehicle.plate} · ` : ""}
          {subtitle}
        </Text>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <Text fz={13} fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmtSpeed(vehicle.last_speed)}
        </Text>
        {vehicle.battery_pct != null && (
          <Text
            fz={11}
            c="dimmed"
            style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
          >
            <BatteryMedium size={12} />
            {vehicle.battery_pct}%
          </Text>
        )}
      </div>
    </UnstyledButton>
  );
}
