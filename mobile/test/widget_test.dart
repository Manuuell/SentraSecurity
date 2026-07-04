import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_gps/data/models/vehicle.dart';
import 'package:sentra_gps/data/models/app_event.dart';

void main() {
  test('Vehicle.fromJson mapea el contrato de la API', () {
    final v = Vehicle.fromJson({
      'id': '9171000001',
      'name': 'Moto de Carlos',
      'plate': 'QWE12F',
      'is_online': true,
      'acc_off': false,
      'last_lat': 10.42,
      'last_lon': -75.55,
      'last_speed': 25.0,
      'battery_pct': 82,
      'last_seen': '2026-07-04T14:00:00+00:00',
    });
    expect(v.id, '9171000001');
    expect(v.isMoving, true); // 25 > 3
    expect(v.ignitionOn, true); // acc_off == false
    expect(v.latLng, isNotNull);
    expect(v.batteryPct, 82);
  });

  test('Vehicle.applyWs actualiza posición desde el WebSocket', () {
    const v = Vehicle(id: '1', name: 'x', lastSpeed: 0);
    final u = v.applyWs({
      'valid': true, 'lat': 10.0, 'lon': -75.0,
      'speed_kmh': 40.0, 'direction': 90, 'acc_off': false,
      'timestamp': '2026-07-04T15:00:00+00:00',
    });
    expect(u.lastLat, 10.0);
    expect(u.speed, 40.0);
    expect(u.isOnline, true);
  });

  test('AppEvent traduce el tipo de alarma', () {
    final e = AppEvent.fromJson({
      'id': 1, 'vehicle_id': '1', 'alarm_type': 'VIBRATION',
      'timestamp': '2026-07-04T15:00:00+00:00', 'acknowledged': false,
    });
    expect(e.label, 'Vibración');
    expect(e.acknowledged, false);
  });
}
