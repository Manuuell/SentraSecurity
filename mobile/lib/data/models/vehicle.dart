import 'package:latlong2/latlong.dart';
import '../../core/util.dart';

/// Vehículo del contrato de la API propia (`_vehicle_dict`): unifica el
/// dispositivo y su última posición en un solo objeto.
class Vehicle {
  final String id;
  final String name;
  final String? plate;
  final String? iccid;
  final bool isOnline;
  final bool? accOff;
  final double? lastLat;
  final double? lastLon;
  final double? lastSpeed;
  final double? voltage;
  final int? lastDirection;
  final int? batteryPct;
  final int? gsmSignal;
  final int? satellites;
  final DateTime? lastSeen;

  const Vehicle({
    required this.id,
    required this.name,
    this.plate,
    this.iccid,
    this.isOnline = false,
    this.accOff,
    this.lastLat,
    this.lastLon,
    this.lastSpeed,
    this.voltage,
    this.lastDirection,
    this.batteryPct,
    this.gsmSignal,
    this.satellites,
    this.lastSeen,
  });

  LatLng? get latLng =>
      (lastLat != null && lastLon != null) ? LatLng(lastLat!, lastLon!) : null;

  double get speed => lastSpeed ?? 0;
  int get course => lastDirection ?? 0;
  bool get isMoving => speed > 3;
  bool get ignitionOn => accOff == false;

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        plate: j['plate'] as String?,
        iccid: j['iccid'] as String?,
        isOnline: j['is_online'] as bool? ?? false,
        accOff: j['acc_off'] as bool?,
        lastLat: (j['last_lat'] as num?)?.toDouble(),
        lastLon: (j['last_lon'] as num?)?.toDouble(),
        lastSpeed: (j['last_speed'] as num?)?.toDouble(),
        voltage: (j['voltage'] as num?)?.toDouble(),
        lastDirection: (j['last_direction'] as num?)?.toInt(),
        batteryPct: (j['battery_pct'] as num?)?.toInt(),
        gsmSignal: (j['gsm_signal'] as num?)?.toInt(),
        satellites: (j['satellites'] as num?)?.toInt(),
        lastSeen: parseApiTime(j['last_seen']),
      );

  /// Aplica un mensaje `position` del WebSocket sobre este vehículo.
  Vehicle applyWs(Map<String, dynamic> m) {
    final valid = m['valid'] == true;
    return Vehicle(
      id: id,
      name: name,
      plate: plate,
      iccid: iccid,
      isOnline: true,
      accOff: m['acc_off'] as bool? ?? accOff,
      lastLat: valid ? (m['lat'] as num?)?.toDouble() ?? lastLat : lastLat,
      lastLon: valid ? (m['lon'] as num?)?.toDouble() ?? lastLon : lastLon,
      lastSpeed: (m['speed_kmh'] as num?)?.toDouble() ?? lastSpeed,
      voltage: (m['voltage'] as num?)?.toDouble() ?? voltage,
      lastDirection: (m['direction'] as num?)?.toInt() ?? lastDirection,
      batteryPct: (m['battery_pct'] as num?)?.toInt() ?? batteryPct,
      gsmSignal: (m['gsm_signal'] as num?)?.toInt() ?? gsmSignal,
      satellites: (m['satellites'] as num?)?.toInt() ?? satellites,
      lastSeen: parseApiTime(m['timestamp']) ?? lastSeen,
    );
  }
}
