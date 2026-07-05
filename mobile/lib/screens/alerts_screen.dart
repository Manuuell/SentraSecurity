import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../state/sentra_service.dart';
import '../data/models/app_event.dart';
import '../ui/tokens.dart';
import '../ui/widgets.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  Color _color(String type) => switch (type) {
        'EMERGENCY' => AppColors.red,
        'DISPLACEMENT' => AppColors.red,
        'OVERSPEED' => AppColors.amber,
        'VIBRATION' => AppColors.amber,
        'LOW_BATTERY' => AppColors.amber,
        _ => AppColors.amber,
      };

  IconData _icon(String type) => switch (type) {
        'EMERGENCY' => Icons.sos_rounded,
        'DISPLACEMENT' => Icons.open_with_rounded,
        'OVERSPEED' => Icons.speed_rounded,
        'VIBRATION' => Icons.vibration_rounded,
        'LOW_BATTERY' => Icons.battery_alert_rounded,
        _ => Icons.warning_amber_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final nuevas = svc.events.where((e) => !e.acknowledged).toList()
      ..sort((a, b) => (b.timestamp ?? DateTime(0)).compareTo(a.timestamp ?? DateTime(0)));
    final anteriores = svc.events.where((e) => e.acknowledged).toList()
      ..sort((a, b) => (b.timestamp ?? DateTime(0)).compareTo(a.timestamp ?? DateTime(0)));

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Alertas', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
      ),
      body: (nuevas.isEmpty && anteriores.isEmpty)
          ? _empty()
          : RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () => svc.refreshEvents(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (nuevas.isNotEmpty) ...[
                    const SectionTitle('Nuevas'),
                    for (final e in nuevas) _card(context, svc, e, isNew: true),
                    const SizedBox(height: 10),
                  ],
                  if (anteriores.isNotEmpty) ...[
                    const SectionTitle('Anteriores'),
                    for (final e in anteriores) _card(context, svc, e, isNew: false),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _card(BuildContext context, SentraService svc, AppEvent e, {required bool isNew}) {
    final color = _color(e.alarmType);
    final name = svc.vehicleById(e.vehicleId)?.name ?? e.vehicleId;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: appCard(radius: 16),
      child: Opacity(
        opacity: isNew ? 1 : 0.6,
        child: Row(
          children: [
            SoftIconChip(icon: _icon(e.alarmType), color: color, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(e.label,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
                  const SizedBox(height: 2),
                  Text(name.isEmpty ? e.vehicleId : name,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.text)),
                  if (e.timestamp != null)
                    Text(timeago.format(e.timestamp!, locale: 'es'),
                        style: const TextStyle(fontSize: 11, color: AppColors.textFaint)),
                ],
              ),
            ),
            if (isNew)
              TextButton(
                onPressed: () => svc.acknowledgeEvent(e.id),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  backgroundColor: AppColors.primarySoft,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Vista', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
              )
            else
              const Icon(Icons.check_circle_rounded, color: AppColors.textFaint, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _empty() => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84, height: 84,
              decoration: BoxDecoration(
                color: AppColors.greenSoft,
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.notifications_none_rounded, color: AppColors.green, size: 42),
            ),
            const SizedBox(height: 18),
            const Text('Todo tranquilo', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
            const SizedBox(height: 6),
            const Text('Te avisaremos aquí si tu moto\nnecesita tu atención', textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.5)),
          ],
        ),
      );
}
