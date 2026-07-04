import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/sentra_service.dart';
import 'map_screen.dart';

class DeviceScreen extends StatelessWidget {
  const DeviceScreen({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final vehicle = svc.vehicleById(vehicleId);

    if (vehicle == null) {
      return Scaffold(
        appBar: AppBar(backgroundColor: Colors.white, elevation: 0),
        body: const Center(child: Text('Vehículo no disponible')),
      );
    }

    final isOnline = vehicle.isOnline;
    final isMoving = vehicle.isMoving;
    final statusColor = !isOnline
        ? const Color(0xFFBDBDBD)
        : isMoving
            ? const Color(0xFF4A90D9)
            : const Color(0xFF58CC02);

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: Color(0xFF3C3C3C)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(vehicle.name.isEmpty ? vehicle.id : vehicle.name,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Color(0xFF3C3C3C))),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Estado
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)],
              ),
              child: Row(
                children: [
                  Container(
                    width: 64, height: 64,
                    decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(18)),
                    child: Icon(Icons.directions_bike, color: statusColor, size: 34),
                  ),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle)),
                        const SizedBox(width: 6),
                        Text(!isOnline ? 'Sin señal' : isMoving ? 'En movimiento' : 'Detenida',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: statusColor)),
                      ]),
                      const SizedBox(height: 4),
                      Text(vehicle.plate ?? 'ID: ${vehicle.id}',
                          style: const TextStyle(fontSize: 12, color: Color(0xFFBDBDBD))),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            const _SectionTitle('Telemetría en tiempo real'),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.7,
              children: [
                _TelCard(icon: Icons.speed_rounded, label: 'Velocidad',
                    value: '${vehicle.speed.toStringAsFixed(0)} km/h',
                    color: vehicle.speed > 80 ? const Color(0xFFE53935) : const Color(0xFF4A90D9)),
                _TelCard(icon: Icons.power_settings_new_rounded, label: 'Motor',
                    value: vehicle.ignitionOn ? 'Encendido' : 'Apagado',
                    color: vehicle.ignitionOn ? const Color(0xFF58CC02) : const Color(0xFFBDBDBD)),
                _TelCard(icon: Icons.battery_charging_full_rounded, label: 'Batería',
                    value: vehicle.batteryPct != null ? '${vehicle.batteryPct}%' : '—',
                    color: (vehicle.batteryPct ?? 100) < 20 ? const Color(0xFFE53935) : const Color(0xFF58CC02)),
                _TelCard(icon: Icons.flash_on_rounded, label: 'Voltaje',
                    value: vehicle.voltage != null ? '${vehicle.voltage!.toStringAsFixed(1)}V' : '—',
                    color: const Color(0xFFFF9600)),
                _TelCard(icon: Icons.satellite_alt_rounded, label: 'Satélites',
                    value: '${vehicle.satellites ?? "—"}',
                    color: const Color(0xFF9C27B0)),
                _TelCard(icon: Icons.signal_cellular_alt_rounded, label: 'Señal GSM',
                    value: vehicle.gsmSignal != null ? '${vehicle.gsmSignal}/31' : '—',
                    color: const Color(0xFF00BCD4)),
              ],
            ),
            const SizedBox(height: 16),

            const _SectionTitle('Acciones'),
            const SizedBox(height: 10),
            _ActionButton(
              icon: Icons.map_rounded,
              label: 'Ver en mapa',
              subtitle: 'Ubicación en tiempo real',
              color: const Color(0xFF4A90D9),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MapScreen(vehicleId: vehicle.id))),
            ),
            const SizedBox(height: 10),
            _ActionButton(
              icon: Icons.power_off_rounded,
              label: 'Cortar motor',
              subtitle: 'Disponible próximamente',
              color: const Color(0xFFE53935),
              onTap: () => _comingSoon(context),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  void _comingSoon(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Corte de motor', style: TextStyle(fontWeight: FontWeight.w800)),
        content: const Text(
          'El corte remoto de motor estará disponible pronto, cuando se habilite '
          'el envío de comandos al rastreador.',
          style: TextStyle(color: Color(0xFF9E9E9E)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Entendido')),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF9E9E9E), letterSpacing: 0.5));
}

class _TelCard extends StatelessWidget {
  const _TelCard({required this.icon, required this.label, required this.value, required this.color});
  final IconData icon;
  final String label, value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
    ),
    child: Row(
      children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
              Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFFBDBDBD))),
            ],
          ),
        ),
      ],
    ),
  );
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.icon, required this.label, required this.subtitle, required this.color, required this.onTap});
  final IconData icon;
  final String label, subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
      ),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
                Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFFBDBDBD))),
              ],
            ),
          ),
          Icon(Icons.arrow_forward_ios_rounded, size: 14, color: color),
        ],
      ),
    ),
  );
}
