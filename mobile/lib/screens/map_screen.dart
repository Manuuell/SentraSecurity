import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/traccar_service.dart';
import '../models/device.dart';
import '../models/position.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.device});
  final Device device;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final MapController _mapCtrl = MapController();
  List<LatLng> _track = [];
  bool _loadingTrack = false;
  bool _followVehicle = true;
  bool _showingToday = false;
  LatLng? _lastPosition;

  @override
  void initState() {
    super.initState();
    _centerOnVehicle();
  }

  void _centerOnVehicle() {
    final pos = context.read<TraccarService>().latestPositions[widget.device.id];
    if (pos != null) {
      _lastPosition = pos.latLng;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _mapCtrl.move(pos.latLng, 16);
      });
    }
  }

  Future<void> _loadTodayTrack() async {
    setState(() { _loadingTrack = true; _showingToday = true; });
    try {
      final svc = context.read<TraccarService>();
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day);
      final history = await svc.getHistory(deviceId: widget.device.id, from: from, to: now);
      setState(() => _track = history.map((p) => p.latLng).toList());
      if (_track.isNotEmpty) _mapCtrl.move(_track.last, 14);
    } finally {
      setState(() => _loadingTrack = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<TraccarService>();
    final pos = svc.latestPositions[widget.device.id];

    if (_followVehicle && pos != null && pos.latLng != _lastPosition) {
      _lastPosition = pos.latLng;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _mapCtrl.move(pos.latLng, _mapCtrl.camera.zoom);
      });
    }

    final isMoving = (pos?.speed ?? 0) > 2;
    final markerColor = !widget.device.isOnline ? const Color(0xFFBDBDBD)
        : isMoving ? const Color(0xFF4A90D9)
        : const Color(0xFF58CC02);

    return Scaffold(
      backgroundColor: Colors.white,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.white.withOpacity(0.95),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: Color(0xFF3C3C3C)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.device.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Color(0xFF3C3C3C))),
            Text(isMoving ? 'En movimiento' : 'Detenida',
                style: TextStyle(fontSize: 11, color: markerColor, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapCtrl,
            options: MapOptions(
              initialCenter: pos?.latLng ?? const LatLng(10.391, -75.479),
              initialZoom: 15,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.sentrasecurity.gps',
              ),
              if (_track.length > 1)
                PolylineLayer(polylines: [
                  Polyline(points: _track, strokeWidth: 4, color: const Color(0xFF4A90D9).withOpacity(0.7)),
                ]),
              if (pos != null)
                MarkerLayer(markers: [
                  Marker(
                    point: pos.latLng,
                    width: 48,
                    height: 48,
                    child: Transform.rotate(
                      angle: pos.course * 3.14159 / 180,
                      child: Container(
                        decoration: BoxDecoration(
                          color: markerColor,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: markerColor.withOpacity(0.4), blurRadius: 10, spreadRadius: 2)],
                        ),
                        child: const Icon(Icons.navigation, color: Colors.white, size: 24),
                      ),
                    ),
                  ),
                ]),
            ],
          ),

          // Botones flotantes
          Positioned(
            right: 14,
            bottom: pos != null ? 220 : 180,
            child: Column(
              children: [
                _MapFab(
                  icon: _followVehicle ? Icons.gps_fixed : Icons.gps_not_fixed,
                  color: _followVehicle ? const Color(0xFF4A90D9) : const Color(0xFF9E9E9E),
                  onTap: () => setState(() => _followVehicle = !_followVehicle),
                  tooltip: 'Seguir moto',
                ),
                const SizedBox(height: 10),
                _MapFab(
                  icon: _showingToday ? Icons.route : Icons.route_outlined,
                  color: _showingToday ? const Color(0xFF4A90D9) : const Color(0xFF9E9E9E),
                  onTap: _loadingTrack ? null : (_showingToday
                      ? () => setState(() { _track = []; _showingToday = false; })
                      : _loadTodayTrack),
                  tooltip: 'Ruta de hoy',
                ),
              ],
            ),
          ),

          // Panel telemetría
          if (pos != null)
            Positioned(
              left: 0, right: 0, bottom: 0,
              child: _TelPanel(pos: pos),
            ),

          if (_loadingTrack)
            const Center(child: CircularProgressIndicator(color: Color(0xFF4A90D9))),
        ],
      ),
    );
  }
}

class _MapFab extends StatelessWidget {
  const _MapFab({required this.icon, required this.color, required this.onTap, this.tooltip});
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  final String? tooltip;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip ?? '',
    child: GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44, height: 44,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.12), blurRadius: 10)],
        ),
        child: Icon(icon, color: color, size: 20),
      ),
    ),
  );
}

class _TelPanel extends StatelessWidget {
  const _TelPanel({required this.pos});
  final Position pos;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(20, 14, 20, 30),
    decoration: const BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 20, offset: Offset(0, -4))],
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 36, height: 4,
            decoration: BoxDecoration(color: const Color(0xFFE0E0E0), borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _TelItem(icon: Icons.speed_rounded, label: 'Velocidad',
                value: '${pos.speed.toStringAsFixed(0)} km/h',
                color: pos.speed > 80 ? const Color(0xFFE53935) : const Color(0xFF4A90D9)),
            _TelItem(icon: Icons.power_settings_new_rounded, label: 'Motor',
                value: pos.ignition == true ? 'ON' : 'OFF',
                color: pos.ignition == true ? const Color(0xFF58CC02) : const Color(0xFFBDBDBD)),
            _TelItem(icon: Icons.battery_charging_full_rounded, label: 'Batería',
                value: pos.battery != null ? '${pos.battery}%' : '—',
                color: (pos.battery ?? 100) < 20 ? const Color(0xFFE53935) : const Color(0xFF58CC02)),
            _TelItem(icon: Icons.access_time_rounded, label: 'Hora',
                value: '${pos.fixTime.toLocal().hour.toString().padLeft(2, "0")}:${pos.fixTime.toLocal().minute.toString().padLeft(2, "0")}',
                color: const Color(0xFF9E9E9E)),
          ],
        ),
      ],
    ),
  );
}

class _TelItem extends StatelessWidget {
  const _TelItem({required this.icon, required this.label, required this.value, required this.color});
  final IconData icon;
  final String label, value;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Container(
        width: 36, height: 36,
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: color, size: 18),
      ),
      const SizedBox(height: 6),
      Text(value, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
      Text(label, style: const TextStyle(color: Color(0xFFBDBDBD), fontSize: 10)),
    ],
  );
}
