import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/traccar_service.dart';
import '../models/device.dart';
import 'device_screen.dart';

class MapAllScreen extends StatelessWidget {
  const MapAllScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<TraccarService>();

    final markers = svc.devices.map((device) {
      final pos = svc.latestPositions[device.id];
      if (pos == null) return null;
      final isMoving = pos.speed > 2;
      final color = !device.isOnline ? const Color(0xFFBDBDBD)
          : isMoving ? const Color(0xFF4A90D9)
          : const Color(0xFF58CC02);

      return Marker(
        point: pos.latLng,
        width: 44,
        height: 44,
        child: GestureDetector(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeviceScreen(device: device))),
          child: Tooltip(
            message: device.name,
            child: Transform.rotate(
              angle: pos.course * 3.14159 / 180,
              child: Container(
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: color.withOpacity(0.4), blurRadius: 8, spreadRadius: 2)],
                ),
                child: const Icon(Icons.navigation, color: Colors.white, size: 22),
              ),
            ),
          ),
        ),
      );
    }).whereType<Marker>().toList();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Mapa general', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Color(0xFF3C3C3C))),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: const Color(0xFF4A90D9).withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                child: Text('${markers.length} motos', style: const TextStyle(fontSize: 12, color: Color(0xFF4A90D9), fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ],
      ),
      body: FlutterMap(
        options: const MapOptions(
          initialCenter: LatLng(10.391, -75.479),
          initialZoom: 13,
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.sentrasecurity.gps',
          ),
          MarkerLayer(markers: markers),
        ],
      ),
    );
  }
}
