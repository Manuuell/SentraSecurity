class Device {
  final int id;
  final String name;
  final String uniqueId; // IMEI
  final String status;   // "online" | "offline" | "unknown"
  final DateTime? lastUpdate;
  final int? positionId;
  final String? phone;
  final String? model;
  final String? contact;

  const Device({
    required this.id,
    required this.name,
    required this.uniqueId,
    required this.status,
    this.lastUpdate,
    this.positionId,
    this.phone,
    this.model,
    this.contact,
  });

  bool get isOnline => status == 'online';

  factory Device.fromJson(Map<String, dynamic> j) => Device(
        id: j['id'] as int,
        name: j['name'] as String,
        uniqueId: j['uniqueId'] as String,
        status: j['status'] as String? ?? 'unknown',
        lastUpdate: j['lastUpdate'] != null
            ? DateTime.parse(j['lastUpdate'] as String)
            : null,
        positionId: j['positionId'] as int?,
        phone: j['phone'] as String?,
        model: j['model'] as String?,
        contact: j['contact'] as String?,
      );

  Device copyWith({String? status, int? positionId, DateTime? lastUpdate}) =>
      Device(
        id: id,
        name: name,
        uniqueId: uniqueId,
        status: status ?? this.status,
        lastUpdate: lastUpdate ?? this.lastUpdate,
        positionId: positionId ?? this.positionId,
        phone: phone,
        model: model,
        contact: contact,
      );
}
