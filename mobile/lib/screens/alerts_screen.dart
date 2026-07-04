import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../state/sentra_service.dart';
import '../data/models/app_event.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  Color _color(String type) => switch (type) {
        'EMERGENCY' => const Color(0xFFE53935),
        'DISPLACEMENT' => const Color(0xFFFF6D00),
        'OVERSPEED' => const Color(0xFFFF9600),
        'VIBRATION' => const Color(0xFFFFC107),
        'LOW_BATTERY' => const Color(0xFFFFC107),
        _ => const Color(0xFFFF9600),
      };

  IconData _icon(String type) => switch (type) {
        'EMERGENCY' => Icons.sos_rounded,
        'DISPLACEMENT' => Icons.open_in_full_rounded,
        'OVERSPEED' => Icons.speed_rounded,
        'VIBRATION' => Icons.vibration_rounded,
        'LOW_BATTERY' => Icons.battery_alert_rounded,
        _ => Icons.warning_amber_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final events = [...svc.events]..sort((a, b) {
        final ack = (a.acknowledged ? 1 : 0) - (b.acknowledged ? 1 : 0);
        if (ack != 0) return ack;
        return (b.timestamp ?? DateTime(0)).compareTo(a.timestamp ?? DateTime(0));
      });

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Alertas', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Color(0xFF3C3C3C))),
      ),
      body: events.isEmpty
          ? _empty()
          : RefreshIndicator(
              onRefresh: () => svc.refreshEvents(),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: events.length,
                itemBuilder: (ctx, i) {
                  final e = events[i];
                  final name = svc.vehicleById(e.vehicleId)?.name ?? e.vehicleId;
                  return _EventCard(
                    event: e,
                    vehicleName: name.isEmpty ? e.vehicleId : name,
                    color: _color(e.alarmType),
                    icon: _icon(e.alarmType),
                    onAck: () => svc.acknowledgeEvent(e.id),
                  );
                },
              ),
            ),
    );
  }

  Widget _empty() => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(color: const Color(0xFFFF9600).withOpacity(0.1), shape: BoxShape.circle),
              child: const Icon(Icons.notifications_none_rounded, color: Color(0xFFFF9600), size: 40),
            ),
            const SizedBox(height: 16),
            const Text('Sin alertas recientes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
            const SizedBox(height: 6),
            const Text('Las alertas del rastreador\naparecerán aquí', textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
          ],
        ),
      );
}

class _EventCard extends StatelessWidget {
  const _EventCard({
    required this.event,
    required this.vehicleName,
    required this.color,
    required this.icon,
    required this.onAck,
  });
  final AppEvent event;
  final String vehicleName;
  final Color color;
  final IconData icon;
  final VoidCallback onAck;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
        ),
        child: Opacity(
          opacity: event.acknowledged ? 0.55 : 1,
          child: Row(
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(event.label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: color)),
                    const SizedBox(height: 2),
                    Text(vehicleName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF3C3C3C))),
                    if (event.timestamp != null)
                      Text(timeago.format(event.timestamp!, locale: 'es'),
                          style: const TextStyle(fontSize: 11, color: Color(0xFFBDBDBD))),
                  ],
                ),
              ),
              if (event.acknowledged)
                const Icon(Icons.check_circle_rounded, color: Color(0xFFBDBDBD), size: 22)
              else
                TextButton(
                  onPressed: onAck,
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFF4A90D9),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                  child: const Text('Reconocer', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
        ),
      );
}
