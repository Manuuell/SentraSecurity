import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../state/sentra_service.dart';
import '../ui/tokens.dart';
import '../ui/vehicle_status.dart';
import '../ui/widgets.dart';
import 'device_screen.dart';

class MapAllScreen extends StatelessWidget {
  const MapAllScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final alerted = svc.alertedVehicleIds;

    final markers = svc.vehicles.map((vehicle) {
      final pos = vehicle.latLng;
      if (pos == null) return null;
      final status = statusFor(vehicle, alerted);

      return Marker(
        point: pos,
        width: 46, height: 46,
        child: GestureDetector(
          onTap: () => Navigator.push(
              context, MaterialPageRoute(builder: (_) => DeviceScreen(vehicleId: vehicle.id))),
          child: Tooltip(
            message: vehicle.name.isEmpty ? vehicle.id : vehicle.name,
            child: VehicleMarkerDot(color: status.color, course: vehicle.course, size: 46),
          ),
        ),
      );
    }).whereType<Marker>().toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mapa', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text('${markers.length} ${markers.length == 1 ? "moto" : "motos"}',
                    style: const TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ],
      ),
      body: FlutterMap(
        options: const MapOptions(
          initialCenter: LatLng(10.423, -75.545),
          initialZoom: 13,
        ),
        children: [
          sentraTiles(),
          MarkerLayer(markers: markers),
          mapAttribution(),
        ],
      ),
    );
  }
}
