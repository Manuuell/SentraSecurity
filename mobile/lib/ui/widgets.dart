import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'tokens.dart';
import 'vehicle_status.dart';

/// Píldora de estado: punto + etiqueta sobre fondo suave.
class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key, this.compact = false});
  final VehicleUiStatus status;
  final bool compact;

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 4 : 6),
        decoration: BoxDecoration(
          color: status.soft,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 7, height: 7,
              decoration: BoxDecoration(color: status.color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(status.label,
                style: TextStyle(
                    fontSize: compact ? 11 : 12,
                    fontWeight: FontWeight.w700,
                    color: status.color)),
          ],
        ),
      );
}

/// Chip cuadrado con icono sobre fondo suave (para métricas y tiles).
class SoftIconChip extends StatelessWidget {
  const SoftIconChip({super.key, required this.icon, required this.color, this.size = 40});
  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size, height: size,
        decoration: BoxDecoration(
          color: color.withOpacity(0.10),
          borderRadius: BorderRadius.circular(size * 0.3),
        ),
        child: Icon(icon, color: color, size: size * 0.5),
      );
}

/// Métrica pequeña en línea: icono + valor + etiqueta debajo.
class MetricInline extends StatelessWidget {
  const MetricInline({super.key, required this.icon, required this.value, required this.label});
  final IconData icon;
  final String value, label;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 14, color: AppColors.textFaint),
            const SizedBox(width: 4),
            Text(value,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text)),
          ]),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textFaint)),
        ],
      );
}

/// Título de sección discreto.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(text,
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700,
                color: AppColors.textSecondary, letterSpacing: 0.3)),
      );
}

/// Capa de tiles clara (CARTO) — el mismo lienzo minimalista que la web.
TileLayer sentraTiles() => TileLayer(
      urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      subdomains: const ['a', 'b', 'c', 'd'],
      userAgentPackageName: 'com.sentrasecurity.gps',
    );

/// Atribución obligatoria de OSM/CARTO.
Widget mapAttribution() => const SimpleAttributionWidget(
      source: Text('© OpenStreetMap © CARTO', style: TextStyle(fontSize: 10)),
    );

/// Marcador de vehículo: flecha de navegación rotada dentro de un círculo.
class VehicleMarkerDot extends StatelessWidget {
  const VehicleMarkerDot({super.key, required this.color, required this.course, this.size = 44});
  final Color color;
  final int course;
  final double size;

  @override
  Widget build(BuildContext context) => Transform.rotate(
        angle: course * 3.14159 / 180,
        child: Container(
          width: size, height: size,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [BoxShadow(color: color.withOpacity(0.35), blurRadius: 10, spreadRadius: 1)],
          ),
          child: Icon(Icons.navigation_rounded, color: Colors.white, size: size * 0.5),
        ),
      );
}
