import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../state/sentra_service.dart';
import '../ui/tokens.dart';
import '../ui/vehicle_status.dart';
import '../ui/widgets.dart';
import 'engine_control_card.dart';
import 'map_screen.dart';
import 'history_screen.dart';

class DeviceScreen extends StatelessWidget {
  const DeviceScreen({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final vehicle = svc.vehicleById(vehicleId);

    if (vehicle == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Vehículo no disponible')),
      );
    }

    final status = statusFor(vehicle, svc.alertedVehicleIds);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(vehicle.name.isEmpty ? vehicle.id : vehicle.name,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Héroe de estado ─────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(20),
            decoration: appCard(),
            child: Row(
              children: [
                SoftIconChip(icon: status.icon, color: status.color, size: 60),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(status.phrase,
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: status.color)),
                      const SizedBox(height: 4),
                      Text(
                        vehicle.lastSeen != null
                            ? 'Actualizado ${timeago.format(vehicle.lastSeen!, locale: 'es')}'
                            : 'Sin reportes todavía',
                        style: const TextStyle(fontSize: 12, color: AppColors.textFaint),
                      ),
                      if (vehicle.plate != null) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.graySoft,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(vehicle.plate!,
                              style: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w800,
                                  color: AppColors.textSecondary, letterSpacing: 1)),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Ubicación (mini-mapa, toca para ampliar) ───────────
          const SectionTitle('Ubicación'),
          GestureDetector(
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => MapScreen(vehicleId: vehicle.id))),
            child: Container(
              height: 170,
              decoration: appCard(radius: 20),
              clipBehavior: Clip.antiAlias,
              child: vehicle.latLng == null
                  ? const Center(
                      child: Text('Sin ubicación todavía',
                          style: TextStyle(fontSize: 13, color: AppColors.textFaint)))
                  : Stack(
                      children: [
                        IgnorePointer(
                          child: FlutterMap(
                            options: MapOptions(
                              initialCenter: vehicle.latLng!,
                              initialZoom: 15,
                              interactionOptions:
                                  const InteractionOptions(flags: InteractiveFlag.none),
                            ),
                            children: [
                              sentraTiles(),
                              MarkerLayer(markers: [
                                Marker(
                                  point: vehicle.latLng!,
                                  width: 40, height: 40,
                                  child: VehicleMarkerDot(
                                      color: status.color, course: vehicle.course, size: 40),
                                ),
                              ]),
                            ],
                          ),
                        ),
                        Positioned(
                          right: 10, bottom: 10,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppColors.border),
                            ),
                            child: const Row(children: [
                              Icon(Icons.open_in_full_rounded, size: 13, color: AppColors.primary),
                              SizedBox(width: 5),
                              Text('Ver en vivo',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
                            ]),
                          ),
                        ),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 16),

          // ── Street View ──────────────────────────────────────────
          _StreetViewCard(vehicleId: vehicle.id),
          const SizedBox(height: 16),

          // ── Histórico de recorridos ─────────────────────────────
          GestureDetector(
            onTap: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => HistoryScreen(vehicleId: vehicle.id))),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: appCard(radius: 16),
              child: Row(
                children: [
                  const SoftIconChip(icon: Icons.history_rounded, color: AppColors.primary, size: 44),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Ver recorridos',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.text)),
                        SizedBox(height: 3),
                        Text('Consulta por dónde anduvo tu moto',
                            style: TextStyle(fontSize: 12, color: AppColors.textFaint)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: AppColors.textFaint),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ── Telemetría ──────────────────────────────────────────
          const SectionTitle('Estado del rastreador'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.9,
            children: [
              _TelCard(icon: Icons.speed_rounded, label: 'Velocidad',
                  value: '${vehicle.speed.toStringAsFixed(0)} km/h',
                  color: vehicle.speed > 80 ? AppColors.red : AppColors.primary),
              _TelCard(icon: Icons.key_rounded, label: 'Encendido',
                  value: vehicle.ignitionOn ? 'Encendido' : 'Apagado',
                  color: vehicle.ignitionOn ? AppColors.green : AppColors.gray),
              _TelCard(icon: Icons.battery_5_bar_rounded, label: 'Batería del GPS',
                  value: vehicle.batteryPct != null ? '${vehicle.batteryPct}%' : '—',
                  color: (vehicle.batteryPct ?? 100) < 20 ? AppColors.red : AppColors.green),
              _TelCard(icon: Icons.electric_bolt_rounded, label: 'Batería de la moto',
                  value: vehicle.voltage != null ? '${vehicle.voltage!.toStringAsFixed(1)} V' : '—',
                  color: AppColors.amber),
              _TelCard(icon: Icons.satellite_alt_rounded, label: 'Satélites GPS',
                  value: '${vehicle.satellites ?? "—"}',
                  color: AppColors.primary),
              _TelCard(icon: Icons.signal_cellular_alt_rounded, label: 'Señal celular',
                  value: vehicle.gsmSignal != null ? _gsmLabel(vehicle.gsmSignal!) : '—',
                  color: AppColors.primary),
            ],
          ),
          const SizedBox(height: 16),

          // ── Seguridad ───────────────────────────────────────────
          const SectionTitle('Seguridad'),
          EngineControlCard(vehicle: vehicle),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  static String _gsmLabel(int rssi) {
    if (rssi >= 20) return 'Excelente';
    if (rssi >= 15) return 'Buena';
    if (rssi >= 10) return 'Regular';
    return 'Débil';
  }
}

class _TelCard extends StatelessWidget {
  const _TelCard({required this.icon, required this.label, required this.value, required this.color});
  final IconData icon;
  final String label, value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: appCard(radius: 16),
    child: Row(
      children: [
        SoftIconChip(icon: icon, color: color, size: 38),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(value,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text)),
              Text(label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10, color: AppColors.textFaint)),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Imagen de Street View de la última posición. El [Future] se guarda en
/// estado (no se recrea en cada build) porque esta pantalla se reconstruye
/// seguido con cada actualización del WebSocket.
class _StreetViewCard extends StatefulWidget {
  const _StreetViewCard({required this.vehicleId});
  final String vehicleId;

  @override
  State<_StreetViewCard> createState() => _StreetViewCardState();
}

class _StreetViewCardState extends State<_StreetViewCard> {
  late Future<Uint8List> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<SentraService>().getStreetview(widget.vehicleId);
  }

  @override
  void didUpdateWidget(covariant _StreetViewCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.vehicleId != widget.vehicleId) {
      _future = context.read<SentraService>().getStreetview(widget.vehicleId);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Uint8List>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Container(
            height: 140,
            decoration: appCard(radius: 16),
            child: const Center(
              child: SizedBox(
                width: 20, height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }
        if (snapshot.hasError || !snapshot.hasData) {
          return const SizedBox.shrink();
        }
        return Container(
          height: 140,
          width: double.infinity,
          decoration: appCard(radius: 16),
          clipBehavior: Clip.antiAlias,
          child: Image.memory(snapshot.data!, fit: BoxFit.cover),
        );
      },
    );
  }
}
