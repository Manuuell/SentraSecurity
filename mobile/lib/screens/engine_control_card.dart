import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../data/models/device_command.dart';
import '../data/models/vehicle.dart';
import '../state/sentra_service.dart';
import '../ui/tokens.dart';
import '../ui/widgets.dart';

const _typeLabel = {
  commandEngineStop: 'Cortar motor',
  commandEngineResume: 'Restaurar motor',
};

const _statusLabel = {
  cmdPending: 'Pendiente',
  cmdSent: 'Enviado',
  cmdConfirmed: 'Confirmado',
  cmdFailed: 'Falló',
  cmdExpired: 'Expiró',
};

const _statusColor = {
  cmdPending: AppColors.gray,
  cmdSent: AppColors.primary,
  cmdConfirmed: AppColors.green,
  cmdFailed: AppColors.red,
  cmdExpired: AppColors.amber,
};

/// Tarjeta de corte/restauración de motor para el rol `client`: pide el
/// comando con confirmación fuerte y refleja el estado real que fija un
/// operador (modo manual — ver docs/corte-motor.md). Nunca éxito optimista.
class EngineControlCard extends StatefulWidget {
  const EngineControlCard({super.key, required this.vehicle});
  final Vehicle vehicle;

  @override
  State<EngineControlCard> createState() => _EngineControlCardState();
}

class _EngineControlCardState extends State<EngineControlCard> {
  List<DeviceCommand> _commands = [];
  bool _loading = true;
  bool _sending = false;
  String? _loadError;
  Timer? _pollTimer;

  DeviceCommand? get _active {
    for (final c in _commands) {
      if (c.isActive) return c;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final commands = await context.read<SentraService>().getCommands(widget.vehicle.id);
      if (!mounted) return;
      setState(() {
        _commands = commands;
        _loading = false;
        _loadError = null;
      });
      _syncPolling();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = 'No se pudo cargar el estado';
      });
    }
  }

  void _syncPolling() {
    final active = _active != null;
    if (active && _pollTimer == null) {
      _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
    } else if (!active && _pollTimer != null) {
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  Future<void> _requestCommand(String type) async {
    setState(() => _sending = true);
    try {
      final command = await context.read<SentraService>().sendCommand(widget.vehicle.id, type);
      if (!mounted) return;
      setState(() {
        _commands = [command, ..._commands];
        _sending = false;
      });
      _syncPolling();
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      final msg = e.response?.statusCode == 409
          ? 'Ya hay una solicitud en curso para esta moto'
          : 'No se pudo enviar la solicitud';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      _load();
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('No se pudo enviar la solicitud')));
    }
  }

  Future<void> _confirmAndSend(String type) async {
    final expected = (widget.vehicle.plate?.isNotEmpty == true ? widget.vehicle.plate! : widget.vehicle.id)
        .toUpperCase();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => _ConfirmCommandDialog(type: type, expectedText: expected),
    );
    if (confirmed == true) _requestCommand(type);
  }

  @override
  Widget build(BuildContext context) {
    final active = _active;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: appCard(radius: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            SoftIconChip(
              icon: Icons.power_settings_new_rounded,
              color: active?.isEngineStop == true ? AppColors.red : AppColors.primary,
              size: 44,
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Text('Corte de motor',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.text)),
            ),
          ]),
          const SizedBox(height: 14),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: SizedBox(
                height: 18, width: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
              ),
            )
          else if (_loadError != null)
            _InlineError(message: _loadError!, onRetry: () {
              setState(() => _loading = true);
              _load();
            })
          else if (active != null)
            _ActiveStatus(command: active)
          else
            Row(
              children: [
                Expanded(
                  child: _CommandButton(
                    label: 'Cortar motor',
                    icon: Icons.power_off_rounded,
                    color: AppColors.red,
                    loading: _sending,
                    onTap: () => _confirmAndSend(commandEngineStop),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _CommandButton(
                    label: 'Restaurar motor',
                    icon: Icons.power_rounded,
                    color: AppColors.green,
                    loading: _sending,
                    onTap: () => _confirmAndSend(commandEngineResume),
                  ),
                ),
              ],
            ),
          if (!_loading && _commands.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 12),
            const Text('Historial',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textFaint, letterSpacing: 0.3)),
            const SizedBox(height: 8),
            for (final c in _commands.take(3)) _HistoryRow(command: c),
          ],
        ],
      ),
    );
  }
}

class _CommandButton extends StatelessWidget {
  const _CommandButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.loading,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final Color color;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => OutlinedButton(
        onPressed: loading ? null : onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(color: color.withOpacity(0.4)),
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18),
            const SizedBox(height: 4),
            Text(label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      );
}

class _ActiveStatus extends StatelessWidget {
  const _ActiveStatus({required this.command});
  final DeviceCommand command;

  String get _message => switch (command.status) {
        cmdPending => 'Solicitud enviada. Un operador la confirmará en breve.',
        cmdSent => 'Comando enviado al equipo. Esperando confirmación.',
        _ => '',
      };

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.graySoft,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(_typeLabel[command.type] ?? command.type,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text)),
                ),
                _StatusBadge(status: command.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(_message, style: const TextStyle(fontSize: 12, color: AppColors.textFaint)),
          ],
        ),
      );
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.command});
  final DeviceCommand command;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(
              child: Text(_typeLabel[command.type] ?? command.type,
                  style: const TextStyle(fontSize: 12, color: AppColors.text)),
            ),
            _StatusBadge(status: command.status),
          ],
        ),
      );
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor[status] ?? AppColors.gray;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(_statusLabel[status] ?? status,
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Text(message, style: const TextStyle(fontSize: 12, color: AppColors.textFaint)),
          ),
          TextButton(onPressed: onRetry, child: const Text('Reintentar')),
        ],
      );
}

/// Confirmación fuerte: escribir la placa/ID antes de ejecutar (paridad con
/// la web — ver ConfirmDangerModal en el plan).
class _ConfirmCommandDialog extends StatefulWidget {
  const _ConfirmCommandDialog({required this.type, required this.expectedText});
  final String type;
  final String expectedText;

  @override
  State<_ConfirmCommandDialog> createState() => _ConfirmCommandDialogState();
}

class _ConfirmCommandDialogState extends State<_ConfirmCommandDialog> {
  final _ctrl = TextEditingController();
  String _value = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isStop = widget.type == commandEngineStop;
    final color = isStop ? AppColors.red : AppColors.green;
    final consequence = isStop
        ? 'La moto no podrá encender hasta que restaures el motor.'
        : 'El motor volverá a funcionar con normalidad.';

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(_typeLabel[widget.type] ?? '',
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.4),
              children: [
                TextSpan(text: '$consequence Escribe '),
                TextSpan(
                  text: widget.expectedText,
                  style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.text),
                ),
                const TextSpan(text: ' para confirmar.'),
              ],
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _ctrl,
            autofocus: true,
            textCapitalization: TextCapitalization.characters,
            onChanged: (v) => setState(() => _value = v.toUpperCase()),
            decoration: InputDecoration(
              hintText: widget.expectedText,
              filled: true,
              fillColor: AppColors.bg,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancelar', style: TextStyle(color: AppColors.textSecondary)),
        ),
        FilledButton(
          onPressed: _value.trim() == widget.expectedText ? () => Navigator.pop(context, true) : null,
          style: FilledButton.styleFrom(
            backgroundColor: color,
            disabledBackgroundColor: color.withOpacity(0.3),
          ),
          child: const Text('Confirmar', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}
