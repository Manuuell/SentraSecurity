import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/sentra_service.dart';
import '../ui/tokens.dart';
import '../ui/widgets.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

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
        title: const Text('Ajustes', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
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

          // Cuenta
          const SectionTitle('Cuenta'),
          _ActionTile(
            icon: Icons.lock_outline_rounded,
            color: AppColors.primary,
            title: 'Cambiar contraseña',
            subtitle: 'Actualiza tu clave de acceso',
            onTap: () => _openChangePassword(context),
          ),
          const SizedBox(height: 20),

          // Ayuda y contacto
          const SectionTitle('Ayuda y contacto'),
          const _ActionTile(
            icon: Icons.location_city_rounded,
            color: AppColors.primary,
            title: 'Cartagena de Indias',
            subtitle: 'Servicio local de monitoreo GPS',
          ),
          const SizedBox(height: 20),

          // Acerca de
          const SectionTitle('Acerca de'),
          const _ActionTile(
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

  void _openChangePassword(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const _ChangePasswordSheet(),
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
  Widget build(BuildContext context) {
    final content = Container(
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
          if (onTap != null) const Icon(Icons.chevron_right_rounded, color: AppColors.textFaint),
        ],
      ),
    );
    return onTap == null ? content : GestureDetector(onTap: onTap, child: content);
  }
}

/// Hoja para cambiar la contraseña (`PATCH /api/auth/me/password`).
class _ChangePasswordSheet extends StatefulWidget {
  const _ChangePasswordSheet();

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final current = _currentCtrl.text;
    final next = _newCtrl.text;
    if (current.isEmpty || next.isEmpty) {
      setState(() => _error = 'Completa todos los campos');
      return;
    }
    if (next.length < 8) {
      setState(() => _error = 'La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (next != _confirmCtrl.text) {
      setState(() => _error = 'Las contraseñas nuevas no coinciden');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await context.read<SentraService>()
          .changePassword(currentPassword: current, newPassword: next);
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contraseña actualizada')),
      );
    } on DioException catch (e) {
      final detail = e.response?.data is Map ? (e.response?.data as Map)['detail'] : null;
      setState(() => _error = e.response?.statusCode == 400
          ? (detail as String? ?? 'No se pudo cambiar la contraseña')
          : 'No se pudo conectar con el servidor');
    } catch (_) {
      setState(() => _error = 'No se pudo conectar con el servidor');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 14,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Cambiar contraseña',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
          const SizedBox(height: 16),
          _PasswordField(controller: _currentCtrl, label: 'Contraseña actual'),
          const SizedBox(height: 12),
          _PasswordField(controller: _newCtrl, label: 'Nueva contraseña'),
          const SizedBox(height: 12),
          _PasswordField(controller: _confirmCtrl, label: 'Confirmar nueva contraseña'),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.redSoft, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                const Icon(Icons.error_outline, color: AppColors.red, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.red, fontSize: 13))),
              ]),
            ),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: FilledButton(
              onPressed: _loading ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                disabledBackgroundColor: AppColors.primary.withOpacity(0.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _loading
                  ? const SizedBox(width: 22, height: 22,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                  : const Text('Guardar', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordField extends StatefulWidget {
  const _PasswordField({required this.controller, required this.label});
  final TextEditingController controller;
  final String label;

  @override
  State<_PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<_PasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) => TextField(
    controller: widget.controller,
    obscureText: _obscure,
    style: const TextStyle(fontSize: 15, color: AppColors.text),
    decoration: InputDecoration(
      labelText: widget.label,
      labelStyle: const TextStyle(color: AppColors.textFaint, fontSize: 14),
      prefixIcon: const Icon(Icons.lock_outline, color: AppColors.textFaint, size: 20),
      suffixIcon: IconButton(
        icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
            color: AppColors.textFaint, size: 20),
        onPressed: () => setState(() => _obscure = !_obscure),
      ),
      filled: true,
      fillColor: AppColors.bg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
    ),
  );
}
