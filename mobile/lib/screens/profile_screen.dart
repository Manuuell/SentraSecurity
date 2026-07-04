import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/sentra_service.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final user = svc.user;

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
            Center(
              child: Column(
                children: [
                  Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(color: const Color(0xFF4A90D9).withOpacity(0.1), shape: BoxShape.circle),
                    child: const Icon(Icons.person, color: Color(0xFF4A90D9), size: 40),
                  ),
                  const SizedBox(height: 12),
                  Text(user?.fullName.isNotEmpty == true ? user!.fullName : (user?.email ?? 'Usuario'),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF3C3C3C))),
                  const SizedBox(height: 4),
                  Text(user?.roleLabel ?? '', style: const TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
                ],
              ),
            ),
            const SizedBox(height: 28),
            if (user != null) ...[
              _InfoTile(icon: Icons.email_outlined, label: 'Correo', value: user.email),
              const SizedBox(height: 10),
            ],
            if (user?.phone != null && user!.phone!.isNotEmpty) ...[
              _InfoTile(icon: Icons.phone_outlined, label: 'Teléfono', value: user.phone!),
              const SizedBox(height: 10),
            ],
            _InfoTile(icon: Icons.location_city_rounded, label: 'Ciudad', value: 'Cartagena de Indias'),
            const SizedBox(height: 28),
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
                // Al cerrar sesión, RootGate vuelve al login automáticamente.
                onPressed: () => svc.logout(),
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
        Flexible(child: Text(value, textAlign: TextAlign.right,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C)))),
      ],
    ),
  );
}
