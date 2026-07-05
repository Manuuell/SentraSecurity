import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:url_launcher/url_launcher.dart';
import '../core/config.dart';
import '../state/sentra_service.dart';
import '../data/models/vehicle.dart';
import '../ui/tokens.dart';
import '../ui/vehicle_status.dart';
import '../ui/widgets.dart';
import 'device_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final vehicles = svc.vehicles;
    final alerted = svc.alertedVehicleIds;
    final firstName = (svc.user?.fullName ?? '').trim().split(' ').first;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(firstName.isEmpty ? 'Hola' : 'Hola, $firstName',
                style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.text)),
            Text(
              vehicles.isEmpty
                  ? 'Bienvenido a SentraSecurity'
                  : vehicles.length == 1
                      ? 'Tu moto, siempre a la vista'
                      : '${vehicles.length} motos protegidas',
              style: const TextStyle(fontSize: 12, color: AppColors.textFaint),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textFaint),
            onPressed: () => svc.refreshVehicles(),
            tooltip: 'Actualizar',
          ),
        ],
      ),
      body: vehicles.isEmpty
          ? const _EmptyState()
          : RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () => svc.refreshVehicles(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (vehicles.length > 1) ...[
                    _FleetSummary(vehicles: vehicles),
                    const SizedBox(height: 14),
                  ],
                  for (final v in vehicles) ...[
                    _VehicleHeroCard(vehicle: v, status: statusFor(v, alerted)),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            ),
    );
  }
}

/// Resumen compacto cuando hay varias motos.
class _FleetSummary extends StatelessWidget {
  const _FleetSummary({required this.vehicles});
  final List<Vehicle> vehicles;

  @override
  Widget build(BuildContext context) {
    final online = vehicles.where((v) => v.isOnline).length;
    return Row(
      children: [
        _chip('${vehicles.length} en total', AppColors.primary),
        const SizedBox(width: 8),
        _chip('$online en línea', AppColors.green),
        if (vehicles.length - online > 0) ...[
          const SizedBox(width: 8),
          _chip('${vehicles.length - online} sin señal', AppColors.gray),
        ],
      ],
    );
  }

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: color.withOpacity(0.09),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
      );
}

/// Tarjeta principal de cada moto: estado en lenguaje claro + métricas clave.
class _VehicleHeroCard extends StatelessWidget {
  const _VehicleHeroCard({required this.vehicle, required this.status});
  final Vehicle vehicle;
  final VehicleUiStatus status;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.push(
          context, MaterialPageRoute(builder: (_) => DeviceScreen(vehicleId: vehicle.id))),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: appCard(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SoftIconChip(icon: Icons.two_wheeler_rounded, color: status.color, size: 52),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(vehicle.name.isEmpty ? vehicle.id : vehicle.name,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
                      const SizedBox(height: 3),
                      Text(status.phrase,
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: status.color)),
                    ],
                  ),
                ),
                StatusPill(status, compact: true),
              ],
            ),
            const SizedBox(height: 14),
            Container(height: 1, color: AppColors.border),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: MetricInline(
                    icon: Icons.speed_rounded,
                    value: '${vehicle.speed.toStringAsFixed(0)} km/h',
                    label: 'Velocidad',
                  ),
                ),
                Expanded(
                  child: MetricInline(
                    icon: Icons.battery_5_bar_rounded,
                    value: vehicle.batteryPct != null ? '${vehicle.batteryPct}%' : '—',
                    label: 'Batería GPS',
                  ),
                ),
                Expanded(
                  child: MetricInline(
                    icon: Icons.schedule_rounded,
                    value: vehicle.lastSeen != null
                        ? timeago.format(vehicle.lastSeen!, locale: 'es')
                        : 'nunca',
                    label: 'Última señal',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 84, height: 84,
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(Icons.two_wheeler_rounded, color: AppColors.primary, size: 42),
              ),
              const SizedBox(height: 18),
              const Text('Aún no tienes motos vinculadas',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
              const SizedBox(height: 8),
              const Text(
                'Cuando SentraSecurity instale tu rastreador,\ntu moto aparecerá aquí automáticamente.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.5),
              ),
              if (AppConfig.supportWhatsApp.isNotEmpty) ...[
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => launchUrl(
                    Uri.parse('https://wa.me/${AppConfig.supportWhatsApp}'
                        '?text=Hola,%20quiero%20activar%20el%20rastreo%20de%20mi%20moto'),
                    mode: LaunchMode.externalApplication,
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: const Icon(Icons.chat_rounded, size: 18),
                  label: const Text('Contactar a SentraSecurity',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ],
            ],
          ),
        ),
      );
}
