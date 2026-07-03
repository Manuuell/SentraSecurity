import 'package:latlong2/latlong.dart';

class Position {
  final int id;
  final int deviceId;
  final DateTime fixTime;
  final double latitude;
  final double longitude;
  final double altitude;
  final double speed;       // km/h (Traccar ya convierte de nudos)
  final double course;      // grados 0-359
  final bool valid;
  final Map<String, dynamic> attributes;

  const Position({
    required this.id,
    required this.deviceId,
    required this.fixTime,
    required this.latitude,
    required this.longitude,
    this.altitude = 0,
    this.speed = 0,
    this.course = 0,
    this.valid = true,
    this.attributes = const {},
  });

  LatLng get latLng => LatLng(latitude, longitude);

  bool? get ignition  => attributes['ignition'] as bool?;
  bool? get motion    => attributes['motion'] as bool?;
  int?  get battery   => attributes['batteryLevel'] as int?;
  double? get voltage => (attributes['power'] as num?)?.toDouble();
  int?  get satellites => attributes['sat'] as int?;
  int?  get gsm       => attributes['rssi'] as int?;

  factory Position.fromJson(Map<String, dynamic> j) => Position(
        id: j['id'] as int,
        deviceId: j['deviceId'] as int,
        fixTime: DateTime.parse(j['fixTime'] as String),
        latitude: (j['latitude'] as num).toDouble(),
        longitude: (j['longitude'] as num).toDouble(),
        altitude: (j['altitude'] as num?)?.toDouble() ?? 0,
        speed: (j['speed'] as num?)?.toDouble() ?? 0,
        course: (j['course'] as num?)?.toDouble() ?? 0,
        valid: j['valid'] as bool? ?? true,
        attributes: Map<String, dynamic>.from(j['attributes'] as Map? ?? {}),
      );
}
