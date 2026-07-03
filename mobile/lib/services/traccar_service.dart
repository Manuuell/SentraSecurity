import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/device.dart';
import '../models/position.dart';
import 'cookie_setup.dart';

class TraccarService extends ChangeNotifier {
  // Host por --dart-define=API_URL=... (sin default de producción en el código).
  // Esta capa completa se reemplaza por la API propia en la Fase 4 (PLAN_APP_MOVIL.md).
  static const String _defaultHost =
      String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8082');

  late final Dio _dio;
  WebSocketChannel? _wsChannel;
  StreamSubscription? _wsSub;

  String _host = _defaultHost;
  bool _authenticated = false;

  List<Device> devices = [];
  Map<int, Position> latestPositions = {};

  bool get authenticated => _authenticated;
  String get host => _host;

  TraccarService() {
    _dio = Dio(BaseOptions(extra: {'withCredentials': true}));
    _init();
  }

  Future<void> _init() async {
    await addCookieSupport(_dio);
    await _loadSavedHost();
  }

  Future<void> _loadSavedHost() async {
    final prefs = await SharedPreferences.getInstance();
    _host = prefs.getString('traccar_host') ?? _defaultHost;
  }

  Future<void> setHost(String host) async {
    _host = host.endsWith('/') ? host.substring(0, host.length - 1) : host;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('traccar_host', _host);
  }

  Future<void> login(String email, String password) async {
    final response = await _dio.post(
      '$_host/api/session',
      data: 'email=${Uri.encodeComponent(email)}&password=${Uri.encodeComponent(password)}',
      options: Options(
        contentType: 'application/x-www-form-urlencoded',
        responseType: ResponseType.plain,
        validateStatus: (s) => s != null && s < 500,
      ),
    );
    if (response.statusCode != 200) {
      throw Exception('Credenciales inválidas (${response.statusCode})');
    }
    _authenticated = true;
    await _fetchDevices();
    await _fetchLatestPositions();
    _connectWebSocket();
    notifyListeners();
  }

  Future<void> logout() async {
    await _dio.delete('$_host/api/session').catchError((_) {});
    _authenticated = false;
    devices = [];
    latestPositions = {};
    _wsChannel?.sink.close();
    _wsChannel = null;
    notifyListeners();
  }

  Future<void> _fetchDevices() async {
    final r = await _dio.get('$_host/api/devices');
    devices = (r.data as List).map((e) => Device.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> refreshDevices() async {
    await _fetchDevices();
    notifyListeners();
  }

  Future<void> _fetchLatestPositions() async {
    final r = await _dio.get('$_host/api/positions');
    for (final e in r.data as List) {
      final pos = Position.fromJson(e as Map<String, dynamic>);
      latestPositions[pos.deviceId] = pos;
    }
  }

  Future<List<Position>> getHistory({
    required int deviceId,
    required DateTime from,
    required DateTime to,
  }) async {
    final r = await _dio.get(
      '$_host/api/positions',
      queryParameters: {
        'deviceId': deviceId,
        'from': from.toUtc().toIso8601String(),
        'to': to.toUtc().toIso8601String(),
      },
    );
    return (r.data as List).map((e) => Position.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> sendCommand(int deviceId, String type) async {
    await _dio.post(
      '$_host/api/commands/send',
      data: jsonEncode({'deviceId': deviceId, 'type': type}),
      options: Options(contentType: 'application/json'),
    );
  }

  Future<void> cutEngine(int deviceId)     => sendCommand(deviceId, 'engineStop');
  Future<void> restoreEngine(int deviceId) => sendCommand(deviceId, 'engineResume');

  void _connectWebSocket() {
    _wsChannel?.sink.close();
    final wsUrl = _host
        .replaceFirst('http://', 'ws://')
        .replaceFirst('https://', 'wss://');
    _wsChannel = WebSocketChannel.connect(Uri.parse('$wsUrl/api/socket'));
    _wsSub = _wsChannel!.stream.listen(
      _onWsMessage,
      onError: (_) => Future.delayed(const Duration(seconds: 5), _connectWebSocket),
      onDone: ()  => Future.delayed(const Duration(seconds: 5), _connectWebSocket),
    );
  }

  void _onWsMessage(dynamic raw) {
    final data = jsonDecode(raw as String) as Map<String, dynamic>;
    if (data['positions'] != null) {
      for (final e in data['positions'] as List) {
        final pos = Position.fromJson(e as Map<String, dynamic>);
        latestPositions[pos.deviceId] = pos;
      }
    }
    if (data['devices'] != null) {
      final updated = {for (final d in devices) d.id: d};
      for (final e in data['devices'] as List) {
        final d = Device.fromJson(e as Map<String, dynamic>);
        updated[d.id] = d;
      }
      devices = updated.values.toList();
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    _wsChannel?.sink.close();
    super.dispose();
  }
}
