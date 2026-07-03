/** Contratos con la API FastAPI actual (server/api/routes.py). */

export interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  iccid: string | null;
  is_online: boolean;
  acc_off: boolean | null;
  last_lat: number | null;
  last_lon: number | null;
  last_speed: number | null;
  last_direction: number | null;
  last_seen: string | null;
  battery_pct: number | null;
  voltage: number | null;
  gsm_signal: number | null;
  satellites: number | null;
}

export interface TrackPoint {
  id: number;
  vehicle_id: string;
  timestamp: string;
  lat: number;
  lon: number;
  speed_kmh: number;
  direction: number;
  valid: boolean;
}

export type AlarmType =
  | "EMERGENCY"
  | "DISPLACEMENT"
  | "VIBRATION"
  | "OVERSPEED"
  | "LOW_BATTERY"
  | (string & {});

export interface Alarm {
  id: number;
  vehicle_id: string;
  alarm_type: AlarmType;
  timestamp: string;
  lat: number | null;
  lon: number | null;
  speed_kmh: number | null;
  acknowledged: boolean;
  notes: string | null;
}

/** Mensaje que emite el backend por WS en cada paquete GPS. */
export interface PositionMessage {
  event: "position";
  device_id: string;
  timestamp: string;
  valid: boolean;
  lat: number;
  lon: number;
  speed_kmh: number;
  direction: number;
  acc_off: boolean;
  battery_pct: number | null;
  voltage: number | null;
  gsm_signal: number | null;
  satellites: number | null;
  alarms: string[];
  packet_type: string;
}

export type VehicleStatus = "moving" | "idle" | "offline" | "alarm";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

// ── Autenticación ───────────────────────────────────────────────

export type Role = "admin" | "operator" | "client";

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}
