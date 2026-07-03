import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/traccar_service.dart';
import 'main_shell.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl  = TextEditingController();
  bool _loading    = false;
  bool _obscure    = true;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await context.read<TraccarService>().login(_emailCtrl.text.trim(), _passCtrl.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MainShell()),
      );
    } catch (e) {
      setState(() => _error = 'Usuario o contraseña incorrectos');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 60),
              Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  color: const Color(0xFF4A90D9).withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.gps_fixed, color: Color(0xFF4A90D9), size: 46),
              ),
              const SizedBox(height: 20),
              const Text('SentraSecurity',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF3C3C3C))),
              const SizedBox(height: 6),
              const Text('Monitoreo GPS para tu moto',
                style: TextStyle(fontSize: 14, color: Color(0xFF9E9E9E))),
              const SizedBox(height: 48),

              _InputField(
                controller: _emailCtrl,
                label: 'Correo electrónico',
                icon: Icons.email_outlined,
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 14),

              _InputField(
                controller: _passCtrl,
                label: 'Contraseña',
                icon: Icons.lock_outline,
                obscure: _obscure,
                suffix: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                      color: const Color(0xFF9E9E9E), size: 20),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),

              if (_error != null) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFEBEE),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(children: [
                    const Icon(Icons.error_outline, color: Color(0xFFE53935), size: 18),
                    const SizedBox(width: 8),
                    Text(_error!, style: const TextStyle(color: Color(0xFFE53935), fontSize: 13)),
                  ]),
                ),
              ],

              const SizedBox(height: 28),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _loading ? null : _login,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF58CC02),
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: const Color(0xFFAFE07A),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: _loading
                      ? const SizedBox(width: 22, height: 22,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                      : const Text('Ingresar',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ),

              const SizedBox(height: 40),
              const Text('Cartagena de Indias · Colombia',
                style: TextStyle(color: Color(0xFFBDBDBD), fontSize: 12)),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _InputField extends StatelessWidget {
  const _InputField({
    required this.controller,
    required this.label,
    required this.icon,
    this.obscure = false,
    this.suffix,
    this.keyboardType,
  });
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    obscureText: obscure,
    keyboardType: keyboardType,
    style: const TextStyle(fontSize: 15, color: Color(0xFF3C3C3C)),
    decoration: InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Color(0xFF9E9E9E), fontSize: 14),
      prefixIcon: Icon(icon, color: const Color(0xFF9E9E9E), size: 20),
      suffixIcon: suffix,
      filled: true,
      fillColor: const Color(0xFFF7F8FA),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF4A90D9), width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
    ),
  );
}
