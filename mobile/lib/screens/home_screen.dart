import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../state/sentra_service.dart';
import '../data/models/vehicle.dart';
import '../ui/tokens.dart';
import '../ui/vehicle_status.dart';
import '../ui/widgets.dart';
import 'device_screen.dart';
import 'history_screen.dart';
import 'map_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final vehicles = svc.vehicles;
    final alerted = svc.alertedVehicleIds;
    final firstName = (svc.user?.fullName ?? '').trim().split(' ').first;

    final single = vehicles.length == 1;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        titleSpacing: 16,
        toolbarHeight: 64,
        title: Row(
          children: [
            const _BrandMark(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(firstName.isEmpty ? 'Hola' : 'Hola, $firstName',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.text)),
                  Text(
                    vehicles.isEmpty
                        ? 'Bienvenido a SentraSecurity'
                        : single
                            ? 'Tu moto, siempre a la vista'
                            : '${vehicles.length} motos protegidas',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppColors.textFaint),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textFaint),
            onPressed: () => svc.refreshVehicles(),
            tooltip: 'Actualizar',
          ),
        ],
      ),
      body: vehicles.isEmpty
          ? const _EmptyState()
          : single
              // Una sola moto: la tarjeta ocupa toda la pantalla, el mapa se expande.
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  child: _VehicleHeroCard(
                    vehicle: vehicles.first,
                    status: statusFor(vehicles.first, alerted),
                    expand: true,
                  ),
                )
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () => svc.refreshVehicles(),
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _FleetSummary(vehicles: vehicles),
                      const SizedBox(height: 14),
                      for (final v in vehicles) ...[
                        _VehicleHeroCard(vehicle: v, status: statusFor(v, alerted)),
                        const SizedBox(height: 12),
                      ],
                    ],
                  ),
                ),
    );
  }
}

/// Marca de SentraSecurity (mismo escudo del splash).
class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) => Container(
        width: 40,
        height: 40,
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: AppColors.primarySoft,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Image.asset('assets/images/logo_mark.png', fit: BoxFit.contain),
      );
}

/// Resumen compacto cuando hay varias motos.
class _FleetSummary extends StatelessWidget {
  const _FleetSummary({required this.vehicles});
  final List<Vehicle> vehicles;

  @override
  Widget build(BuildContext context) {
    final online = vehicles.where((v) => v.isOnline).length;
    return Row(
      children: [
        _chip('${vehicles.length} en total', AppColors.primary),
        const SizedBox(width: 8),
        _chip('$online en línea', AppColors.green),
        if (vehicles.length - online > 0) ...[
          const SizedBox(width: 8),
          _chip('${vehicles.length - online} sin señal', AppColors.gray),
        ],
      ],
    );
  }

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: color.withOpacity(0.09),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
      );
}

/// Tarjeta principal de cada moto: minimapa en vivo + estado + telemetría + acciones.
/// Con [expand] el minimapa crece para ocupar toda la altura disponible.
class _VehicleHeroCard extends StatelessWidget {
  const _VehicleHeroCard({required this.vehicle, required this.status, this.expand = false});
  final Vehicle vehicle;
  final VehicleUiStatus status;
  final bool expand;

  void _open(BuildContext context, Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final map = GestureDetector(
      onTap: () => _open(context, MapScreen(vehicleId: vehicle.id)),
      child: _MiniMap(vehicle: vehicle, status: status),
    );

    return Container(
      decoration: appCard(),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
        children: [
          // ── Cabecera ──────────────────────────────────────────
          GestureDetector(
            onTap: () => _open(context, DeviceScreen(vehicleId: vehicle.id)),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  SoftIconChip(icon: Icons.two_wheeler_rounded, color: status.color, size: 48),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(vehicle.name.isEmpty ? vehicle.id : vehicle.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
                        const SizedBox(height: 3),
                        Text(status.phrase,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: status.color)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusPill(status, compact: true),
                ],
              ),
            ),
          ),

          // ── Minimapa (toca para ver en vivo) ──────────────────
          if (expand) Expanded(child: map) else SizedBox(height: 150, child: map),

          // ── Telemetría ────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: MetricInline(
                    icon: Icons.speed_rounded,
                    value: '${vehicle.speed.toStringAsFixed(0)} km/h',
                    label: 'Velocidad',
                  ),
                ),
                Expanded(
                  child: MetricInline(
                    icon: vehicle.ignitionOn ? Icons.key_rounded : Icons.key_off_rounded,
                    value: vehicle.ignitionOn ? 'Encendida' : 'Apagada',
                    label: 'Motor',
                  ),
                ),
                Expanded(
                  child: MetricInline(
                    icon: Icons.battery_5_bar_rounded,
                    value: vehicle.batteryPct != null ? '${vehicle.batteryPct}%' : '—',
                    label: 'Batería',
                  ),
                ),
                Expanded(
                  child: MetricInline(
                    icon: Icons.schedule_rounded,
                    value: vehicle.lastSeen != null
                        ? timeago.format(vehicle.lastSeen!, locale: 'es_short')
                        : 'nunca',
                    label: 'Señal',
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1, color: AppColors.border, indent: 16, endIndent: 16),

          // ── Acciones rápidas ──────────────────────────────────
          Row(
            children: [
              Expanded(
                child: _CardAction(
                  icon: Icons.my_location_rounded,
                  label: 'En vivo',
                  onTap: () => _open(context, MapScreen(vehicleId: vehicle.id)),
                ),
              ),
              const _ActionDivider(),
              Expanded(
                child: _CardAction(
                  icon: Icons.history_rounded,
                  label: 'Recorridos',
                  onTap: () => _open(context, HistoryScreen(vehicleId: vehicle.id)),
                ),
              ),
              const _ActionDivider(),
              Expanded(
                child: _CardAction(
                  icon: Icons.tune_rounded,
                  label: 'Detalle',
                  onTap: () => _open(context, DeviceScreen(vehicleId: vehicle.id)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Minimapa no interactivo con la última posición de la moto.
class _MiniMap extends StatefulWidget {
  const _MiniMap({required this.vehicle, required this.status});
  final Vehicle vehicle;
  final VehicleUiStatus status;

  @override
  State<_MiniMap> createState() => _MiniMapState();
}

class _MiniMapState extends State<_MiniMap> {
  final MapController _ctrl = MapController();

  @override
  void didUpdateWidget(_MiniMap old) {
    super.didUpdateWidget(old);
    final pos = widget.vehicle.latLng;
    if (pos != null && pos != old.vehicle.latLng) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _ctrl.move(pos, _ctrl.camera.zoom);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pos = widget.vehicle.latLng;
    if (pos == null) {
      return Container(
        color: AppColors.graySoft,
        alignment: Alignment.center,
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.location_off_rounded, color: AppColors.textFaint, size: 26),
            SizedBox(height: 6),
            Text('Sin ubicación todavía',
                style: TextStyle(fontSize: 12, color: AppColors.textFaint)),
          ],
        ),
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
          IgnorePointer(
            child: FlutterMap(
              mapController: _ctrl,
              options: MapOptions(
                initialCenter: pos,
                initialZoom: 15.5,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.none),
              ),
              children: [
                sentraTiles(),
                MarkerLayer(markers: [
                  Marker(
                    point: pos,
                    width: 40, height: 40,
                    child: VehicleMarkerDot(
                        color: widget.status.color, course: widget.vehicle.course, size: 40),
                  ),
                ]),
              ],
            ),
          ),
          Positioned(
            right: 10, bottom: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.my_location_rounded, size: 13, color: AppColors.primary),
                SizedBox(width: 5),
                Text('Ver en vivo',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
              ]),
            ),
          ),
        ],
    );
  }
}

/// Botón de acción dentro de la tarjeta.
class _CardAction extends StatelessWidget {
  const _CardAction({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: AppColors.primary),
              const SizedBox(width: 7),
              Flexible(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text)),
              ),
            ],
          ),
        ),
      );
}

class _ActionDivider extends StatelessWidget {
  const _ActionDivider();
  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 26, color: AppColors.border);
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 84, height: 84,
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(Icons.two_wheeler_rounded, color: AppColors.primary, size: 42),
              ),
              const SizedBox(height: 18),
              const Text('Aún no tienes motos vinculadas',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
              const SizedBox(height: 8),
              const Text(
                'Cuando SentraSecurity instale tu rastreador,\ntu moto aparecerá aquí automáticamente.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.5),
              ),
            ],
          ),
        ),
      );
}
