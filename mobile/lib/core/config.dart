/// Configuración por --dart-define (sin default inseguro de producción en el código).
/// Producción: se pasa API_URL=https://sentrasecurity.duckdns.org al compilar.
/// Dev con emulador Android: 10.0.2.2 apunta al localhost del host.
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://sentrasecurity.duckdns.org',
  );

  /// ws(s)://host/api/ws derivado de la URL de la API.
  static String get wsUrl => '${apiBaseUrl.replaceFirst('http', 'ws')}/api/ws';
}
