import '../../core/util.dart';

const commandEngineStop = 'ENGINE_STOP';
const commandEngineResume = 'ENGINE_RESUME';

const cmdPending = 'pending';
const cmdSent = 'sent';
const cmdConfirmed = 'confirmed';
const cmdFailed = 'failed';
const cmdExpired = 'expired';

/// Comando de corte/restauración de motor (`_command_dict` del backend).
/// El cliente nunca recibe el texto del SMS: solo admin/operator lo ven
/// desde el panel web, que es quien lo envía en el modo manual actual
/// (ver docs/corte-motor.md).
class DeviceCommand {
  final int id;
  final String vehicleId;
  final String type;
  final String status;
  final DateTime? createdAt;
  final DateTime? sentAt;
  final DateTime? confirmedAt;
  final String? error;

  const DeviceCommand({
    required this.id,
    required this.vehicleId,
    required this.type,
    required this.status,
    this.createdAt,
    this.sentAt,
    this.confirmedAt,
    this.error,
  });

  bool get isActive => status == cmdPending || status == cmdSent;
  bool get isEngineStop => type == commandEngineStop;

  factory DeviceCommand.fromJson(Map<String, dynamic> j) => DeviceCommand(
        id: j['id'] as int,
        vehicleId: j['vehicle_id'] as String,
        type: j['type'] as String,
        status: j['status'] as String,
        createdAt: parseApiTime(j['created_at']),
        sentAt: parseApiTime(j['sent_at']),
        confirmedAt: parseApiTime(j['confirmed_at']),
        error: j['error'] as String?,
      );
}
