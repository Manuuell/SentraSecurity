"""
Sinotrack / Tianqin protocol parser.
Handles V6 (boot packet with ICCID) and V8 (periodic GPS packet).

Packet formats:
  V6: *XX,IMEI,V6,HHMMSS,A,lat,N,lon,E,speed,dir,DDMMYY,vstatus,mcc,mnc,lac,cellid,ICCID#
  V8: *XX,IMEI,V8,HHMMSS,A,lat,N,lon,E,speed,dir,DDMMYY,vstatus,mcc,mnc,lac,cellid,sats,gsm,voltage,bat#
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class VehicleStatus:
    displacement_alarm: bool = False
    vibration_alarm: bool = False
    emergency_alarm: bool = False
    speed_alert: bool = False
    low_battery_alert: bool = False
    acc_off: bool = False
    arming: bool = False

    def to_dict(self) -> dict:
        return {
            "displacement_alarm": self.displacement_alarm,
            "vibration_alarm": self.vibration_alarm,
            "emergency_alarm": self.emergency_alarm,
            "speed_alert": self.speed_alert,
            "low_battery_alert": self.low_battery_alert,
            "acc_off": self.acc_off,
            "arming": self.arming,
        }


@dataclass
class GPSPacket:
    device_id: str
    packet_type: str          # V6 or V8
    timestamp: datetime
    valid: bool               # A = valid, V = invalid
    latitude: float
    longitude: float
    speed_kmh: float
    direction: int
    vehicle_status: VehicleStatus
    mcc: str
    mnc: str
    lac: str
    cell_id: str
    # V6 only
    iccid: Optional[str] = None
    # V8 only
    satellites: Optional[int] = None
    gsm_signal: Optional[int] = None
    voltage: Optional[float] = None     # Volts
    battery_pct: Optional[int] = None   # 0-100


def _ddmm_to_decimal(raw: str) -> float:
    """Convert DDMM.MMMM or DDDMM.MMMM to decimal degrees."""
    dot = raw.index(".")
    degrees = int(raw[: dot - 2])
    minutes = float(raw[dot - 2 :])
    return degrees + minutes / 60.0


def _parse_vehicle_status(hex_str: str) -> VehicleStatus:
    """
    4-byte hex string (8 ASCII hex chars).
    Negative logic: bit=0 means active/alarm.
    Byte layout (from protocol Appendix 1 — see docs/protocolo-st907l.md §2):
      Byte 1 (first pair):  bit1=0 → displacement alarm, bit2=0 → report missing
      Byte 2 (second pair): bit1=0 → vibration alarm
      Byte 3 (third pair):  bit1=0 → arming, bit2=0 → ACC off
      Byte 4 (fourth pair): bit1=0 → emergency alarm, bit2=0 → speed alert,
                             bit5=0 or bit6=0 → low battery
    """
    if len(hex_str) != 8:
        return VehicleStatus()
    try:
        b = [int(hex_str[i : i + 2], 16) for i in range(0, 8, 2)]
    except ValueError:
        return VehicleStatus()

    def bit(byte_val: int, n: int) -> bool:
        return bool((byte_val >> n) & 1)

    return VehicleStatus(
        displacement_alarm=not bit(b[0], 1),
        vibration_alarm=not bit(b[1], 1),
        arming=not bit(b[2], 1),
        acc_off=not bit(b[2], 2),
        emergency_alarm=not bit(b[3], 1),
        speed_alert=not bit(b[3], 2),
        low_battery_alert=not bit(b[3], 5) or not bit(b[3], 6),
    )


def _parse_timestamp(time_str: str, date_str: str) -> datetime:
    """
    time_str: HHMMSS  date_str: DDMMYY  (UTC)
    """
    try:
        dt = datetime.strptime(date_str + time_str, "%d%m%y%H%M%S")
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def parse_packet(raw: str) -> Optional[GPSPacket]:
    """
    Parse a raw Sinotrack packet string.
    Returns None if the packet cannot be parsed.
    """
    raw = raw.strip()
    if not raw.startswith("*") or not raw.endswith("#"):
        logger.debug("Ignored non-Sinotrack data: %r", raw[:40])
        return None

    # Strip leading * and trailing #
    body = raw[1:-1]
    parts = body.split(",")

    # Minimum common fields: XX,IMEI,TYPE,TIME,VALID,LAT,N,LON,E,SPEED,DIR,DATE,VSTATUS,MCC,MNC,LAC,CELLID
    if len(parts) < 17:
        logger.warning("Packet too short (%d fields): %r", len(parts), raw[:60])
        return None

    try:
        manufacturer = parts[0]  # noqa: F841 (kept for future use)
        device_id    = parts[1]
        packet_type  = parts[2]
        time_str     = parts[3]
        valid        = parts[4].upper() == "A"
        lat_raw      = parts[5]
        lat_dir      = parts[6]
        lon_raw      = parts[7]
        lon_dir      = parts[8]
        speed_knots  = float(parts[9])
        direction    = int(parts[10])
        date_str     = parts[11]
        vstatus_hex  = parts[12]
        mcc          = parts[13]
        mnc          = parts[14]
        lac          = parts[15]
        cell_id      = parts[16]
    except (IndexError, ValueError) as exc:
        logger.warning("Failed parsing common fields: %s | packet: %r", exc, raw[:80])
        return None

    latitude  = _ddmm_to_decimal(lat_raw)
    longitude = _ddmm_to_decimal(lon_raw)
    if lat_dir == "S":
        latitude  = -latitude
    if lon_dir == "W":
        longitude = -longitude

    speed_kmh = round(speed_knots * 1.852, 2)
    timestamp = _parse_timestamp(time_str, date_str)
    vstatus   = _parse_vehicle_status(vstatus_hex)

    packet = GPSPacket(
        device_id=device_id,
        packet_type=packet_type,
        timestamp=timestamp,
        valid=valid,
        latitude=latitude,
        longitude=longitude,
        speed_kmh=speed_kmh,
        direction=direction,
        vehicle_status=vstatus,
        mcc=mcc,
        mnc=mnc,
        lac=lac,
        cell_id=cell_id,
    )

    if packet_type == "V6" and len(parts) >= 18:
        packet.iccid = parts[17]

    elif packet_type == "V8" and len(parts) >= 21:
        try:
            packet.satellites  = int(parts[17])
            packet.gsm_signal  = int(parts[18])
            raw_voltage        = parts[19]
            packet.voltage     = int(raw_voltage) / 10.0 if raw_voltage else None
            raw_bat            = parts[20]
            packet.battery_pct = int(raw_bat) if raw_bat else None
        except (ValueError, IndexError) as exc:
            logger.debug("V8 extended fields parse error: %s", exc)

    return packet


def get_active_alarms(packet: GPSPacket) -> list[str]:
    """Return list of active alarm names for a packet."""
    alarms = []
    s = packet.vehicle_status
    if s.emergency_alarm:
        alarms.append("EMERGENCY")
    if s.displacement_alarm:
        alarms.append("DISPLACEMENT")
    if s.vibration_alarm:
        alarms.append("VIBRATION")
    if s.speed_alert:
        alarms.append("OVERSPEED")
    if s.low_battery_alert:
        alarms.append("LOW_BATTERY")
    return alarms
