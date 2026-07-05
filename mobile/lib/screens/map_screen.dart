import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../state/sentra_service.dart';
import '../data/models/vehicle.dart';
import '../ui/tokens.dart';
import '../ui/vehicle_status.dart';
import '../ui/widgets.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.vehicleId});
  final String vehicleId;

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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final v = context.read<SentraService>().vehicleById(widget.vehicleId);
      if (v?.latLng != null) {
        _lastPosition = v!.latLng;
        _mapCtrl.move(v.latLng!, 16);
      }
    });
  }

  Future<void> _loadTodayTrack() async {
    setState(() { _loadingTrack = true; _showingToday = true; });
    try {
      final svc = context.read<SentraService>();
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day);
      final history = await svc.getHistory(vehicleId: widget.vehicleId, from: from, to: now);
      if (!mounted) return;
      setState(() => _track = history.map((p) => p.latLng).toList());
      if (_track.isNotEmpty) _mapCtrl.move(_track.last, 14);
    } finally {
      if (mounted) setState(() => _loadingTrack = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final vehicle = svc.vehicleById(widget.vehicleId);
    final pos = vehicle?.latLng;
    final status = vehicle != null
        ? statusFor(vehicle, svc.alertedVehicleIds)
        : VehicleUiStatus.offline;

    if (_followVehicle && pos != null && pos != _lastPosition) {
      _lastPosition = pos;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _mapCtrl.move(pos, _mapCtrl.camera.zoom);
      });
    }

    return Scaffold(
      backgroundColor: AppColors.surface,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: AppColors.surface.withOpacity(0.95),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(vehicle?.name ?? '',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.text)),
            Text(status.label,
                style: TextStyle(fontSize: 11, color: status.color, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapCtrl,
            options: const MapOptions(
              initialCenter: LatLng(10.423, -75.545),
              initialZoom: 14,
            ),
            children: [
              sentraTiles(),
              if (_track.length > 1)
                PolylineLayer(polylines: [
                  Polyline(points: _track, strokeWidth: 4, color: AppColors.primary.withOpacity(0.75)),
                ]),
              if (pos != null)
                MarkerLayer(markers: [
                  Marker(
                    point: pos,
                    width: 48, height: 48,
                    child: VehicleMarkerDot(color: status.color, course: vehicle?.course ?? 0, size: 48),
                  ),
                ]),
              mapAttribution(),
            ],
          ),

          // Controles del mapa
          Positioned(
            right: 14,
            bottom: vehicle != null ? 210 : 120,
            child: Column(
              children: [
                _MapFab(
                  icon: _followVehicle ? Icons.gps_fixed_rounded : Icons.gps_not_fixed_rounded,
                  active: _followVehicle,
                  onTap: () => setState(() => _followVehicle = !_followVehicle),
                  tooltip: 'Seguir moto',
                ),
                const SizedBox(height: 10),
                _MapFab(
                  icon: Icons.route_rounded,
                  active: _showingToday,
                  onTap: _loadingTrack
                      ? null
                      : (_showingToday
                          ? () => setState(() { _track = []; _showingToday = false; })
                          : _loadTodayTrack),
                  tooltip: 'Recorrido de hoy',
                ),
              ],
            ),
          ),

          if (vehicle != null)
            Positioned(left: 0, right: 0, bottom: 0, child: _TelPanel(vehicle: vehicle, status: status)),

          if (_loadingTrack)
            const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        ],
      ),
    );
  }
}

class _MapFab extends StatelessWidget {
  const _MapFab({required this.icon, required this.active, required this.onTap, this.tooltip});
  final IconData icon;
  final bool active;
  final VoidCallback? onTap;
  final String? tooltip;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip ?? '',
    child: GestureDetector(
      onTap: onTap,
      child: Container(
        width: 46, height: 46,
        decoration: BoxDecoration(
          color: active ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: active ? AppColors.primary : AppColors.border),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 10)],
        ),
        child: Icon(icon, color: active ? Colors.white : AppColors.textSecondary, size: 20),
      ),
    ),
  );
}

class _TelPanel extends StatelessWidget {
  const _TelPanel({required this.vehicle, required this.status});
  final Vehicle vehicle;
  final VehicleUiStatus status;

  @override
  Widget build(BuildContext context) {
    final seen = vehicle.lastSeen?.toLocal();
    final hora = seen != null
        ? '${seen.hour.toString().padLeft(2, "0")}:${seen.minute.toString().padLeft(2, "0")}'
        : '—';
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 30),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 36, height: 4,
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _TelItem(icon: Icons.speed_rounded, label: 'Velocidad',
                  value: '${vehicle.speed.toStringAsFixed(0)} km/h',
                  color: vehicle.speed > 80 ? AppColors.red : AppColors.primary),
              _TelItem(icon: Icons.key_rounded, label: 'Encendido',
                  value: vehicle.ignitionOn ? 'Sí' : 'No',
                  color: vehicle.ignitionOn ? AppColors.green : AppColors.gray),
              _TelItem(icon: Icons.battery_5_bar_rounded, label: 'Batería',
                  value: vehicle.batteryPct != null ? '${vehicle.batteryPct}%' : '—',
                  color: (vehicle.batteryPct ?? 100) < 20 ? AppColors.red : AppColors.green),
              _TelItem(icon: Icons.schedule_rounded, label: 'Última señal', value: hora,
                  color: AppColors.textSecondary),
            ],
          ),
        ],
      ),
    );
  }
}

class _TelItem extends StatelessWidget {
  const _TelItem({required this.icon, required this.label, required this.value, required this.color});
  final IconData icon;
  final String label, value;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      SoftIconChip(icon: icon, color: color, size: 36),
      const SizedBox(height: 6),
      Text(value, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
      Text(label, style: const TextStyle(color: AppColors.textFaint, fontSize: 10)),
    ],
  );
}
