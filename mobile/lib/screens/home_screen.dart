import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../services/traccar_service.dart';
import '../models/device.dart';
import 'device_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    timeago.setLocaleMessages('es', timeago.EsMessages());
  }

  @override
  Widget build(BuildContext context) {
    final svc    = context.watch<TraccarService>();
    final online = svc.devices.where((d) => d.isOnline).length;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('SentraSecurity', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF3C3C3C))),
            Text('${svc.devices.length} motos registradas', style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF9E9E9E)),
            onPressed: () => svc.refreshDevices(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Stats
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              children: [
                _StatCard(label: 'Total', value: '${svc.devices.length}', color: const Color(0xFF4A90D9), icon: Icons.directions_bike),
                const SizedBox(width: 10),
                _StatCard(label: 'En línea', value: '$online', color: const Color(0xFF58CC02), icon: Icons.wifi),
                const SizedBox(width: 10),
                _StatCard(label: 'Sin señal', value: '${svc.devices.length - online}', color: const Color(0xFFFF9600), icon: Icons.wifi_off),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Lista
          Expanded(
            child: svc.devices.isEmpty
                ? _EmptyState()
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: svc.devices.length,
                    itemBuilder: (ctx, i) => _DeviceCard(device: svc.devices[i]),
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
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
      ),
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

class _DeviceCard extends StatelessWidget {
  const _DeviceCard({required this.device});
  final Device device;

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<TraccarService>();
    final pos = svc.latestPositions[device.id];
    final isMoving = (pos?.speed ?? 0) > 2;

    Color statusColor;
    String statusText;
    IconData statusIcon;

    if (!device.isOnline) {
      statusColor = const Color(0xFFBDBDBD);
      statusText = 'Sin señal';
      statusIcon = Icons.signal_wifi_off;
    } else if (isMoving) {
      statusColor = const Color(0xFF4A90D9);
      statusText = 'En movimiento';
      statusIcon = Icons.navigation;
    } else if (pos?.ignition == true) {
      statusColor = const Color(0xFF58CC02);
      statusText = 'Motor encendido';
      statusIcon = Icons.power_settings_new;
    } else {
      statusColor = const Color(0xFF9E9E9E);
      statusText = 'Detenido';
      statusIcon = Icons.pause_circle_outline;
    }

    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeviceScreen(device: device))),
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
            // Icono moto
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.directions_bike, color: statusColor, size: 28),
            ),
            const SizedBox(width: 14),

            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(device.name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(statusIcon, color: statusColor, size: 13),
                      const SizedBox(width: 4),
                      Text(statusText, style: TextStyle(fontSize: 12, color: statusColor, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  if (device.lastUpdate != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      timeago.format(device.lastUpdate!, locale: 'es'),
                      style: const TextStyle(fontSize: 11, color: Color(0xFFBDBDBD)),
                    ),
                  ],
                ],
              ),
            ),

            // Velocidad
            if (pos != null) Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${pos.speed.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: isMoving ? const Color(0xFF4A90D9) : const Color(0xFFBDBDBD)),
                ),
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
        const Text('Sin motos registradas', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
        const SizedBox(height: 6),
        const Text('Agrega un tracker en Traccar', style: TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
      ],
    ),
  );
}
