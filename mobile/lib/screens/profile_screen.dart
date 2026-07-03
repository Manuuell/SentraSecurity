import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/traccar_service.dart';
import 'login_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final svc = context.read<TraccarService>();

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Perfil', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Color(0xFF3C3C3C))),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Avatar
            Center(
              child: Column(
                children: [
                  Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(color: const Color(0xFF4A90D9).withOpacity(0.1), shape: BoxShape.circle),
                    child: const Icon(Icons.person, color: Color(0xFF4A90D9), size: 40),
                  ),
                  const SizedBox(height: 12),
                  const Text('Administrador', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF3C3C3C))),
                  const SizedBox(height: 4),
                  const Text('SentraSecurity GPS', style: TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
                ],
              ),
            ),

            const SizedBox(height: 28),

            // Info
            _InfoTile(icon: Icons.location_city_rounded, label: 'Ciudad', value: 'Cartagena de Indias'),
            const SizedBox(height: 10),
            _InfoTile(icon: Icons.public_rounded, label: 'Servidor', value: 'Oracle Cloud'),
            const SizedBox(height: 10),
            _InfoTile(icon: Icons.verified_rounded, label: 'Plan', value: 'Profesional'),

            const SizedBox(height: 28),

            // Cerrar sesión
            SizedBox(
              width: double.infinity,
              height: 50,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.logout_rounded, size: 18),
                label: const Text('Cerrar sesión', style: TextStyle(fontWeight: FontWeight.w700)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFE53935),
                  side: const BorderSide(color: Color(0xFFE53935)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () async {
                  await svc.logout();
                  if (!context.mounted) return;
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                    (_) => false,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label, value;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
    ),
    child: Row(
      children: [
        Icon(icon, color: const Color(0xFF4A90D9), size: 20),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
        const Spacer(),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
      ],
    ),
  );
}
