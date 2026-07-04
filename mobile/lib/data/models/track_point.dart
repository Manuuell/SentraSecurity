import 'package:latlong2/latlong.dart';
import '../../core/util.dart';

/// Punto de histórico del contrato `_position_dict`.
class TrackPoint {
  final DateTime? timestamp;
  final double lat;
  final double lon;
  final double speedKmh;
  final int direction;

  const TrackPoint({
    required this.timestamp,
    required this.lat,
    required this.lon,
    this.speedKmh = 0,
    this.direction = 0,
  });

  LatLng get latLng => LatLng(lat, lon);

  factory TrackPoint.fromJson(Map<String, dynamic> j) => TrackPoint(
        timestamp: parseApiTime(j['timestamp']),
        lat: (j['lat'] as num).toDouble(),
        lon: (j['lon'] as num).toDouble(),
        speedKmh: (j['speed_kmh'] as num?)?.toDouble() ?? 0,
        direction: (j['direction'] as num?)?.toInt() ?? 0,
      );
}
