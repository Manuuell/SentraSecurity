import 'package:flutter/material.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Alertas', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Color(0xFF3C3C3C))),
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(color: const Color(0xFFFF9600).withOpacity(0.1), shape: BoxShape.circle),
              child: const Icon(Icons.notifications_none_rounded, color: Color(0xFFFF9600), size: 40),
            ),
            const SizedBox(height: 16),
            const Text('Sin alertas recientes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF3C3C3C))),
            const SizedBox(height: 6),
            const Text('Las alertas de velocidad y batería\naparecerán aquí', textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
          ],
        ),
      ),
    );
  }
}
