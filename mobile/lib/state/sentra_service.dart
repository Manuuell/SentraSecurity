import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as ws_status;

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/push_service.dart';
import '../core/token_storage.dart';
import '../data/models/app_event.dart';
import '../data/models/auth_user.dart';
import '../data/models/device_command.dart';
import '../data/models/track_point.dart';
import '../data/models/vehicle.dart';

/// Estado central de la app: sesión (JWT), flota, eventos y tiempo real (WS).
class SentraService extends ChangeNotifier {
  final TokenStorage _storage = TokenStorage();
  late final ApiClient _api = ApiClient(_storage)..onSessionExpired = _onSessionExpired;

  AuthUser? user;
  List<Vehicle> vehicles = [];
  List<AppEvent> events = [];

  bool get authenticated => user != null;
  int get unacknowledgedCount => events.where((e) => !e.acknowledged).length;

  /// Vehículos con alertas sin reconocer (para pintar estado "alerta").
  Set<String> get alertedVehicleIds =>
      events.where((e) => !e.acknowledged).map((e) => e.vehicleId).toSet();

  // ── WebSocket ────────────────────────────────────────────────
  WebSocketChannel? _ws;
  StreamSubscription? _wsSub;
  Timer? _reconnectTimer;
  int _wsAttempt = 0;
  bool _wsClosedByUs = false;

  // ── Sesión ───────────────────────────────────────────────────

  /// Intenta restaurar la sesión al abrir la app (refresh silencioso).
  Future<bool> tryRestoreSession() async {
    if (!await _storage.hasSession) return false;
    try {
      final r = await _api.dio.get('/api/auth/me');
      user = AuthUser.fromJson(r.data as Map<String, dynamic>);
      await _loadInitialData();
      _connectWs();
      _registerPush();
      notifyListeners();
      return true;
    } catch (_) {
      await _storage.clear();
      return false;
    }
  }

  Future<void> login(String email, String password) async {
    final r = await _api.dio.post('/api/auth/login',
        data: {'email': email, 'password': password});
    final data = r.data as Map<String, dynamic>;
    await _storage.save(data['access_token'] as String, data['refresh_token'] as String);
    user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);
    await _loadInitialData();
    _connectWs();
    _registerPush();
    notifyListeners();
  }

  void _registerPush() {
    // Best-effort: pedir permiso y registrar el token nunca debe bloquear
    // el login ni tumbar la sesión si Firebase no está configurado aún.
    PushService.instance.requestAndRegister(_sendPushToken);
  }

  Future<void> _sendPushToken(String token) async {
    try {
      await _api.dio.post('/api/push_tokens', data: {
        'fcm_token': token,
        'platform': 'android',
      });
    } catch (_) {/* best-effort */}
  }

  Future<void> logout() async {
    final refresh = await _storage.refreshToken;
    if (refresh != null) {
      try {
        await _api.dio.post('/api/auth/logout', data: {'refresh_token': refresh});
      } catch (_) {/* logout local igual procede */}
    }
    await _storage.clear();
    _disconnectWs();
    user = null;
    vehicles = [];
    events = [];
    notifyListeners();
  }

  void _onSessionExpired() {
    _disconnectWs();
    user = null;
    vehicles = [];
    events = [];
    notifyListeners();
  }

  // ── Datos ────────────────────────────────────────────────────

  Future<void> _loadInitialData() async {
    await Future.wait([refreshVehicles(), refreshEvents()]);
  }

  Future<void> refreshVehicles() async {
    final r = await _api.dio.get('/api/vehicles');
    vehicles = (r.data as List)
        .map((e) => Vehicle.fromJson(e as Map<String, dynamic>))
        .toList();
    notifyListeners();
  }

  Future<void> refreshEvents() async {
    final r = await _api.dio.get('/api/alarms', queryParameters: {'limit': 200});
    events = (r.data as List)
        .map((e) => AppEvent.fromJson(e as Map<String, dynamic>))
        .toList();
    notifyListeners();
  }

  Future<void> acknowledgeEvent(int id) async {
    // Optimista
    final i = events.indexWhere((e) => e.id == id);
    if (i == -1) return;
    final prev = events[i];
    events[i] = AppEvent(
      id: prev.id, vehicleId: prev.vehicleId, alarmType: prev.alarmType,
      timestamp: prev.timestamp, lat: prev.lat, lon: prev.lon, acknowledged: true,
    );
    notifyListeners();
    try {
      await _api.dio.patch('/api/alarms/$id/acknowledge');
    } catch (_) {
      events[i] = prev; // revertir
      notifyListeners();
    }
  }

  Future<List<TrackPoint>> getHistory({
    required String vehicleId,
    required DateTime from,
    required DateTime to,
  }) async {
    final r = await _api.dio.get(
      '/api/vehicles/$vehicleId/positions',
      queryParameters: {
        'since': from.toUtc().toIso8601String(),
        'until': to.toUtc().toIso8601String(),
        'limit': 5000,
      },
    );
    return (r.data as List)
        .map((e) => TrackPoint.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.dio.patch('/api/auth/me/password', data: {
      'current_password': currentPassword,
      'new_password': newPassword,
    });
  }

  Future<List<DeviceCommand>> getCommands(String vehicleId) async {
    final r = await _api.dio.get('/api/vehicles/$vehicleId/commands');
    return (r.data as List)
        .map((e) => DeviceCommand.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<DeviceCommand> sendCommand(String vehicleId, String type) async {
    final r = await _api.dio
        .post('/api/vehicles/$vehicleId/commands', data: {'type': type});
    return DeviceCommand.fromJson(r.data as Map<String, dynamic>);
  }

  /// Imagen de Street View de la última posición conocida. Lanza si el
  /// servidor no tiene Street View configurado o no hay imagen disponible.
  Future<Uint8List> getStreetview(String vehicleId) async {
    final r = await _api.dio.get(
      '/api/vehicles/$vehicleId/streetview',
      options: Options(responseType: ResponseType.bytes),
    );
    return Uint8List.fromList(r.data as List<int>);
  }

  Vehicle? vehicleById(String id) {
    for (final v in vehicles) {
      if (v.id == id) return v;
    }
    return null;
  }

  // ── Tiempo real (WebSocket) ──────────────────────────────────

  Future<void> _connectWs() async {
    _disconnectWs(byUs: true);
    _wsClosedByUs = false;
    final token = await _storage.accessToken;
    if (token == null) return;
    try {
      _ws = WebSocketChannel.connect(Uri.parse(AppConfig.wsUrl));
      _ws!.sink.add(jsonEncode({'type': 'auth', 'token': token}));
      _wsSub = _ws!.stream.listen(
        _onWsMessage,
        onError: (_) => _scheduleReconnect(),
        onDone: _scheduleReconnect,
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _onWsMessage(dynamic raw) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    if (msg['type'] == 'auth_ok') {
      _wsAttempt = 0;
      return;
    }
    if (msg['type'] == 'auth_error') {
      _ws?.sink.close();
      return;
    }
    if (msg['event'] == 'position') {
      final id = msg['device_id'] as String?;
      if (id == null) return;
      final i = vehicles.indexWhere((v) => v.id == id);
      if (i != -1) {
        vehicles[i] = vehicles[i].applyWs(msg);
        notifyListeners();
      } else {
        refreshVehicles(); // vehículo nuevo autoregistrado
      }
      if ((msg['alarms'] as List?)?.isNotEmpty ?? false) {
        refreshEvents();
      }
    }
  }

  void _scheduleReconnect() {
    _wsSub?.cancel();
    _wsSub = null;
    _ws = null;
    if (_wsClosedByUs) return;
    _wsAttempt++;
    final seconds = (1 << _wsAttempt).clamp(2, 30);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(seconds: seconds), () {
      if (!_wsClosedByUs && authenticated) _connectWs();
    });
  }

  void _disconnectWs({bool byUs = true}) {
    _wsClosedByUs = byUs;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _wsSub?.cancel();
    _wsSub = null;
    _ws?.sink.close(ws_status.normalClosure);
    _ws = null;
  }

  /// Llamado desde el ciclo de vida de la app.
  void onAppPaused() => _disconnectWs(byUs: true);

  void onAppResumed() {
    if (authenticated) {
      _connectWs();
      refreshVehicles();
      refreshEvents();
    }
  }

  @override
  void dispose() {
    _disconnectWs();
    super.dispose();
  }
}
