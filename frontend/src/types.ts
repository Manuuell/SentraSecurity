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
  sim_phone: string | null;
  has_command_password: boolean;
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
  | "GEOFENCE_ENTER"
  | "GEOFENCE_EXIT"
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

export interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string | null;
  vehicle_count: number;
}

// ── Comandos al dispositivo (Fase 3 — corte de motor) ──────────────

export type CommandType = "ENGINE_STOP" | "ENGINE_RESUME";
export type CommandStatus = "pending" | "sent" | "confirmed" | "failed" | "expired";

export interface DeviceCommand {
  id: number;
  vehicle_id: string;
  type: CommandType;
  status: CommandStatus;
  requested_by: number;
  created_at: string;
  sent_at: string | null;
  confirmed_at: string | null;
  error: string | null;
  /** Solo presentes para admin/operator mientras el comando sigue activo. */
  sms_text?: string;
  sms_phone?: string | null;
}

// ── Geocercas (Fase 5) ─────────────────────────────────────────────

export type GeofenceKind = "circle" | "polygon";

/** [lat, lon] en grados. */
export type LatLon = [number, number];

export interface CircleGeometry {
  center: LatLon;
  radius_m: number;
}
export interface PolygonGeometry {
  points: LatLon[];
}
export type GeofenceGeometry = CircleGeometry | PolygonGeometry;

export interface GeofenceVehicleLink {
  vehicle_id: string;
  notify_enter: boolean;
  notify_exit: boolean;
}

export interface Geofence {
  id: number;
  name: string;
  color: string;
  kind: GeofenceKind;
  geometry: GeofenceGeometry;
  is_active: boolean;
  created_by: number | null;
  created_at: string | null;
  vehicles: GeofenceVehicleLink[];
}
