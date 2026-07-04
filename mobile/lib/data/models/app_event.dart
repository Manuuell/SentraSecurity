import '../../core/util.dart';

/// Alerta/evento del contrato `_alarm_dict`.
class AppEvent {
  final int id;
  final String vehicleId;
  final String alarmType;
  final DateTime? timestamp;
  final double? lat;
  final double? lon;
  final bool acknowledged;

  const AppEvent({
    required this.id,
    required this.vehicleId,
    required this.alarmType,
    this.timestamp,
    this.lat,
    this.lon,
    this.acknowledged = false,
  });

  factory AppEvent.fromJson(Map<String, dynamic> j) => AppEvent(
        id: j['id'] as int,
        vehicleId: j['vehicle_id'] as String,
        alarmType: j['alarm_type'] as String,
        timestamp: parseApiTime(j['timestamp']),
        lat: (j['lat'] as num?)?.toDouble(),
        lon: (j['lon'] as num?)?.toDouble(),
        acknowledged: j['acknowledged'] as bool? ?? false,
      );

  static const labels = <String, String>{
    'EMERGENCY': 'Emergencia',
    'DISPLACEMENT': 'Desplazamiento',
    'VIBRATION': 'Vibración',
    'OVERSPEED': 'Exceso de velocidad',
    'LOW_BATTERY': 'Batería baja',
  };

  String get label => labels[alarmType] ?? alarmType;
}
