import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

const _channelId = 'sentra_alerts';
const _channel = AndroidNotificationChannel(
  _channelId,
  'Alertas de SentraSecurity',
  description: 'Emergencia, vibración, exceso de velocidad y batería baja',
  importance: Importance.high,
);

/// Notificaciones push (Fase 4 — FCM). Si el proyecto de Firebase todavía no
/// está configurado (falta google-services.json), se queda en silencio sin
/// romper el resto de la app.
class PushService {
  PushService._();
  static final instance = PushService._();

  final _local = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  /// Se llama una vez al arrancar la app (antes del login).
  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Push: Firebase no configurado todavía ($e)');
      return;
    }

    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);
    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );

    FirebaseMessaging.onMessage.listen(_showForeground);
    _ready = true;
  }

  /// Pide permiso y registra el token actual contra el backend. Se llama
  /// tras login/restaurar sesión, y de nuevo cuando Firebase rota el token.
  Future<void> requestAndRegister(Future<void> Function(String token) onToken) async {
    if (!_ready) return;
    try {
      await FirebaseMessaging.instance.requestPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await onToken(token);
      FirebaseMessaging.instance.onTokenRefresh.listen(onToken);
    } catch (e) {
      debugPrint('Push: no se pudo registrar el token ($e)');
    }
  }

  void _showForeground(RemoteMessage message) {
    final n = message.notification;
    if (n == null) return;
    _local.show(
      n.hashCode,
      n.title,
      n.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId, 'Alertas de SentraSecurity',
          importance: Importance.high, priority: Priority.high,
        ),
      ),
    );
  }
}
