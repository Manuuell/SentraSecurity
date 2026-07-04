import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../state/sentra_service.dart';
import '../data/models/vehicle.dart';
import 'device_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final vehicles = svc.vehicles;
    final online = vehicles.where((v) => v.isOnline).length;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('SentraSecurity', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF3C3C3C))),
            Text('${vehicles.length} ${vehicles.length == 1 ? "moto" : "motos"}', style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF9E9E9E)),
            onPressed: () => svc.refreshVehicles(),
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              children: [
                _StatCard(label: 'Total', value: '${vehicles.length}', color: const Color(0xFF4A90D9), icon: Icons.directions_bike),
                const SizedBox(width: 10),
                _StatCard(label: 'En línea', value: '$online', color: const Color(0xFF58CC02), icon: Icons.wifi),
                const SizedBox(width: 10),
                _StatCard(label: 'Sin señal', value: '${vehicles.length - online}', color: const Color(0xFFFF9600), icon: Icons.wifi_off),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: vehicles.isEmpty
                ? const _EmptyState()
                : RefreshIndicator(
                    onRefresh: () => svc.refreshVehicles(),
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      itemCount: vehicles.length,
                      itemBuilder: (ctx, i) => _VehicleCard(vehicle: vehicles[i]),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.color, required this.icon});
  final String label, value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(color: color.withOpacity(0.08), borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color)),
              Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF9E9E9E))),
            ],
          ),
        ],
      ),
    ),
  );
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({required this.vehicle});
  final Vehicle vehicle;

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    String statusText;
    IconData statusIcon;

    if (!vehicle.isOnline) {
      statusColor = const Color(0xFFBDBDBD);
      statusText = 'Sin señal';
      statusIcon = Icons.signal_wifi_off;
    } else if (vehicle.isMoving) {
      statusColor = const Color(0xFF4A90D9);
      statusText = 'En movimiento';
      statusIcon = Icons.navigation;
    } else if (vehicle.ignitionOn) {
      statusColor = const Color(0xFF58CC02);
      statusText = 'Motor encendido';
      statusIcon = Icons.power_settings_new;
    } else {
      statusColor = const Color(0xFF9E9E9E);
      statusText = 'Detenido';
      statusIcon = Icons.pause_circle_outline;
    }

    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeviceScreen(vehicleId: vehicle.id))),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(14)),
              child: Icon(Icons.directions_bike, color: statusColor, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(vehicle.name.isEmpty ? vehicle.id : vehicle.name,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(statusIcon, color: statusColor, size: 13),
                      const SizedBox(width: 4),
                      Text(statusText, style: TextStyle(fontSize: 12, color: statusColor, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  if (vehicle.lastSeen != null) ...[
                    const SizedBox(height: 2),
                    Text(timeago.format(vehicle.lastSeen!, locale: 'es'),
                        style: const TextStyle(fontSize: 11, color: Color(0xFFBDBDBD))),
                  ],
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(vehicle.speed.toStringAsFixed(0),
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800,
                        color: vehicle.isMoving ? const Color(0xFF4A90D9) : const Color(0xFFBDBDBD))),
                const Text('km/h', style: TextStyle(fontSize: 10, color: Color(0xFFBDBDBD))),
              ],
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFFBDBDBD)),
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
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 80, height: 80,
          decoration: BoxDecoration(color: const Color(0xFF4A90D9).withOpacity(0.1), shape: BoxShape.circle),
          child: const Icon(Icons.directions_bike, color: Color(0xFF4A90D9), size: 40),
        ),
        const SizedBox(height: 16),
        const Text('Aún no tienes motos', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
        const SizedBox(height: 6),
        const Text('Contacta a SentraSecurity para\nactivar tu servicio', textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
      ],
    ),
  );
}
