import type { Vehicle, VehicleStatus } from "../types";
import { STATUS_COLORS } from "../styles/theme";
import { parseTs } from "./format";

/** Minutos sin reportar para considerar la moto fuera de línea. */
const OFFLINE_AFTER_MS = 5 * 60 * 1000;

/**
 * El estado se deriva de `last_seen` en el cliente porque el backend aún no
 * desmarca `is_online` (bug B4 del plan). Cuando eso se corrija, esta función
 * puede delegar en el campo del servidor.
 */
export function vehicleStatus(v: Vehicle, unackedAlarmIds: Set<string>, now: number): VehicleStatus {
  const seenAt = v.last_seen ? parseTs(v.last_seen) : 0;
  if (!seenAt || now - seenAt > OFFLINE_AFTER_MS) return "offline";
  if (unackedAlarmIds.has(v.id)) return "alarm";
  if ((v.last_speed ?? 0) > 3) return "moving";
  return "idle";
}

export const STATUS_META: Record<VehicleStatus, { color: string; label: string }> = {
  moving: { color: STATUS_COLORS.moving, label: "En movimiento" },
  idle: { color: STATUS_COLORS.idle, label: "Detenida" },
  offline: { color: STATUS_COLORS.offline, label: "Sin señal" },
  alarm: { color: STATUS_COLORS.alarm, label: "Alerta" },
};

export const ALARM_LABELS: Record<string, { label: string; color: string }> = {
  EMERGENCY: { label: "Emergencia", color: "#dc2626" },
  DISPLACEMENT: { label: "Desplazamiento", color: "#ea580c" },
  VIBRATION: { label: "Vibración", color: "#d97706" },
  OVERSPEED: { label: "Exceso de velocidad", color: "#ea580c" },
  LOW_BATTERY: { label: "Batería baja", color: "#d97706" },
};
