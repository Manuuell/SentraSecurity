import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/config.dart';
import '../state/sentra_service.dart';
import '../ui/tokens.dart';
import '../ui/widgets.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  String _initials(String name, String email) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty) return parts[0][0].toUpperCase();
    return email.isNotEmpty ? email[0].toUpperCase() : '?';
  }

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final user = svc.user;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Perfil', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Cabecera de usuario
          Container(
            padding: const EdgeInsets.all(20),
            decoration: appCard(),
            child: Row(
              children: [
                Container(
                  width: 60, height: 60,
                  decoration: const BoxDecoration(color: AppColors.primarySoft, shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      _initials(user?.fullName ?? '', user?.email ?? ''),
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.primary),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.fullName.isNotEmpty == true ? user!.fullName : (user?.email ?? 'Usuario'),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text),
                      ),
                      const SizedBox(height: 3),
                      Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: AppColors.textFaint)),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.primarySoft,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(user?.roleLabel ?? '',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Ayuda y contacto
          const SectionTitle('Ayuda y contacto'),
          if (AppConfig.supportWhatsApp.isNotEmpty)
            _ActionTile(
              icon: Icons.chat_rounded,
              color: AppColors.green,
              title: 'Escríbenos por WhatsApp',
              subtitle: 'Soporte de SentraSecurity',
              onTap: () => launchUrl(
                Uri.parse('https://wa.me/${AppConfig.supportWhatsApp}'),
                mode: LaunchMode.externalApplication,
              ),
            ),
          _ActionTile(
            icon: Icons.location_city_rounded,
            color: AppColors.primary,
            title: 'Cartagena de Indias',
            subtitle: 'Servicio local de monitoreo GPS',
          ),
          const SizedBox(height: 20),

          // Acerca de
          const SectionTitle('Acerca de'),
          _ActionTile(
            icon: Icons.verified_user_rounded,
            color: AppColors.textSecondary,
            title: 'SentraSecurity GPS',
            subtitle: 'Versión 1.0.0',
          ),
          const SizedBox(height: 24),

          // Cerrar sesión — RootGate vuelve al login automáticamente
          SizedBox(
            width: double.infinity,
            height: 50,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text('Cerrar sesión', style: TextStyle(fontWeight: FontWeight.w700)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.red,
                side: BorderSide(color: AppColors.red.withOpacity(0.4)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: () => svc.logout(),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    this.onTap,
  });
  final IconData icon;
  final Color color;
  final String title, subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: appCard(radius: 16),
          child: Row(
            children: [
              SoftIconChip(icon: icon, color: color, size: 42),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.text)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.textFaint)),
                  ],
                ),
              ),
              if (onTap != null)
                const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: AppColors.textFaint),
            ],
          ),
        ),
      );
}
