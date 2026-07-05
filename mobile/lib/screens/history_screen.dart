import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../state/sentra_service.dart';
import '../data/models/track_point.dart';
import '../ui/tokens.dart';
import '../ui/widgets.dart';

/// Rango de fechas predefinido para el histórico.
enum _Preset { hoy, ayer, semana, custom }

extension on _Preset {
  String get label => switch (this) {
        _Preset.hoy => 'Hoy',
        _Preset.ayer => 'Ayer',
        _Preset.semana => '7 días',
        _Preset.custom => 'Rango',
      };
}

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final MapController _mapCtrl = MapController();
  _Preset _preset = _Preset.hoy;
  DateTimeRange? _customRange;
  List<TrackPoint> _points = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  /// Traduce el preset seleccionado a un rango concreto [from, to].
  DateTimeRange _rangeFor(_Preset p) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return switch (p) {
      _Preset.hoy => DateTimeRange(start: today, end: now),
      _Preset.ayer =>
        DateTimeRange(start: today.subtract(const Duration(days: 1)), end: today),
      _Preset.semana =>
        DateTimeRange(start: today.subtract(const Duration(days: 7)), end: now),
      _Preset.custom => _customRange ?? DateTimeRange(start: today, end: now),
    };
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: now,
      initialDateRange: _customRange,
      locale: const Locale('es'),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.light(primary: AppColors.primary),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;
    // El picker devuelve fechas a medianoche; extendemos el fin al final del día.
    final range = DateTimeRange(
      start: picked.start,
      end: picked.end.add(const Duration(days: 1)),
    );
    setState(() {
      _preset = _Preset.custom;
      _customRange = range;
    });
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final range = _rangeFor(_preset);
    try {
      final svc = context.read<SentraService>();
      final pts = await svc.getHistory(
        vehicleId: widget.vehicleId,
        from: range.start,
        to: range.end,
      );
      if (!mounted) return;
      setState(() {
        _points = pts;
        _loading = false;
      });
      _fitToTrack();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudo cargar el recorrido';
        _loading = false;
      });
    }
  }

  void _fitToTrack() {
    final pts = _points.where((p) => p.lat != 0 || p.lon != 0).map((p) => p.latLng).toList();
    if (pts.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (pts.length == 1) {
        _mapCtrl.move(pts.first, 15);
      } else {
        _mapCtrl.fitCamera(
          CameraFit.bounds(
            bounds: LatLngBounds.fromPoints(pts),
            padding: const EdgeInsets.fromLTRB(40, 100, 40, 220),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final svc = context.watch<SentraService>();
    final vehicle = svc.vehicleById(widget.vehicleId);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Histórico',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.text)),
            Text(vehicle?.name ?? widget.vehicleId,
                style: const TextStyle(fontSize: 11, color: AppColors.textFaint, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      body: Column(
        children: [
          _PresetBar(
            selected: _preset,
            customLabel: _customRangeLabel(),
            onSelect: (p) {
              if (p == _Preset.custom) {
                _pickCustomRange();
              } else {
                setState(() => _preset = p);
                _load();
              }
            },
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  String? _customRangeLabel() {
    if (_preset != _Preset.custom || _customRange == null) return null;
    final f = DateFormat('d MMM', 'es');
    final start = _customRange!.start;
    // El fin real es exclusivo (medianoche del día siguiente): mostramos el día visible.
    final end = _customRange!.end.subtract(const Duration(days: 1));
    return start.year == end.year && start.month == end.month && start.day == end.day
        ? f.format(start)
        : '${f.format(start)} – ${f.format(end)}';
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_error != null) {
      return _CenteredMessage(
        icon: Icons.cloud_off_rounded,
        title: _error!,
        actionLabel: 'Reintentar',
        onAction: _load,
      );
    }
    final valid = _points.where((p) => p.lat != 0 || p.lon != 0).toList();
    if (valid.isEmpty) {
      return _CenteredMessage(
        icon: Icons.route_rounded,
        title: 'Sin recorridos en este rango',
        subtitle: 'Prueba con otras fechas.',
        actionLabel: 'Cambiar fechas',
        onAction: _pickCustomRange,
      );
    }
    return _TrackView(mapCtrl: _mapCtrl, points: valid);
  }
}

// ── Barra de presets ───────────────────────────────────────────────

class _PresetBar extends StatelessWidget {
  const _PresetBar({required this.selected, required this.onSelect, this.customLabel});
  final _Preset selected;
  final ValueChanged<_Preset> onSelect;
  final String? customLabel;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(bottom: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          children: _Preset.values.map((p) {
            final active = p == selected;
            final label =
                p == _Preset.custom && customLabel != null ? customLabel! : p.label;
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: GestureDetector(
                  onTap: () => onSelect(p),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: active ? AppColors.primary : AppColors.graySoft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: active ? Colors.white : AppColors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      );
}

// ── Mapa + resumen ─────────────────────────────────────────────────

class _TrackView extends StatelessWidget {
  const _TrackView({required this.mapCtrl, required this.points});
  final MapController mapCtrl;
  final List<TrackPoint> points;

  /// Color de un tramo según su velocidad (paleta sobria de la marca).
  static Color _speedColor(double kmh) {
    if (kmh < 5) return AppColors.gray;
    if (kmh < 40) return AppColors.primary;
    if (kmh < 70) return AppColors.green;
    return AppColors.red;
  }

  @override
  Widget build(BuildContext context) {
    final start = points.first;
    final end = points.last;

    // Un polyline por tramo, coloreado por la velocidad del punto de destino.
    final segments = <Polyline>[];
    for (var i = 1; i < points.length; i++) {
      segments.add(Polyline(
        points: [points[i - 1].latLng, points[i].latLng],
        strokeWidth: 4,
        color: _speedColor(points[i].speedKmh),
      ));
    }

    return Stack(
      children: [
        FlutterMap(
          mapController: mapCtrl,
          options: MapOptions(
            initialCenter: start.latLng,
            initialZoom: 14,
          ),
          children: [
            sentraTiles(),
            if (segments.isNotEmpty) PolylineLayer(polylines: segments),
            MarkerLayer(markers: [
              _endpoint(start.latLng, AppColors.green, Icons.play_arrow_rounded),
              _endpoint(end.latLng, AppColors.red, Icons.flag_rounded),
            ]),
            mapAttribution(),
          ],
        ),
        Positioned(left: 0, right: 0, bottom: 0, child: _Summary(points: points)),
      ],
    );
  }

  Marker _endpoint(LatLng at, Color color, IconData icon) => Marker(
        point: at,
        width: 34,
        height: 34,
        child: Container(
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [BoxShadow(color: color.withOpacity(0.35), blurRadius: 8)],
          ),
          child: Icon(icon, color: Colors.white, size: 18),
        ),
      );
}

class _Summary extends StatelessWidget {
  const _Summary({required this.points});
  final List<TrackPoint> points;

  @override
  Widget build(BuildContext context) {
    const distance = Distance();
    var meters = 0.0;
    var maxSpeed = 0.0;
    for (var i = 1; i < points.length; i++) {
      meters += distance.as(LengthUnit.Meter, points[i - 1].latLng, points[i].latLng);
      if (points[i].speedKmh > maxSpeed) maxSpeed = points[i].speedKmh;
    }
    if (points.first.speedKmh > maxSpeed) maxSpeed = points.first.speedKmh;

    final km = meters / 1000;
    final kmLabel = km >= 10 ? km.toStringAsFixed(0) : km.toStringAsFixed(1);

    final t0 = points.first.timestamp;
    final t1 = points.last.timestamp;
    final durLabel = (t0 != null && t1 != null) ? _fmtDuration(t1.difference(t0)) : '—';

    return Container(
      margin: const EdgeInsets.all(14),
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: appCard(radius: 20).copyWith(
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 16)],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _stat(Icons.straighten_rounded, '$kmLabel km', 'Distancia'),
          _divider(),
          _stat(Icons.speed_rounded, '${maxSpeed.toStringAsFixed(0)} km/h', 'Vel. máx.'),
          _divider(),
          _stat(Icons.schedule_rounded, durLabel, 'Duración'),
          _divider(),
          _stat(Icons.place_rounded, '${points.length}', 'Puntos'),
        ],
      ),
    );
  }

  Widget _divider() => Container(width: 1, height: 34, color: AppColors.border);

  Widget _stat(IconData icon, String value, String label) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: AppColors.primary),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text)),
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textFaint)),
        ],
      );

  static String _fmtDuration(Duration d) {
    if (d.inMinutes < 1) return '<1 min';
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h == 0) return '${m}min';
    return '${h}h ${m}min';
  }
}

// ── Estado vacío / error ───────────────────────────────────────────

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SoftIconChip(icon: icon, color: AppColors.textFaint, size: 56),
              const SizedBox(height: 16),
              Text(title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.text)),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(subtitle!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 13, color: AppColors.textFaint)),
              ],
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 20),
                TextButton(
                  onPressed: onAction,
                  style: TextButton.styleFrom(
                    backgroundColor: AppColors.primarySoft,
                    foregroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text(actionLabel!,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ],
            ],
          ),
        ),
      );
}
