import 'dart:async';
import 'package:dio/dio.dart';
import 'config.dart';
import 'token_storage.dart';

/// Cliente HTTP hacia la API propia. Adjunta el JWT y, ante un 401, refresca
/// el token una sola vez (single-flight) y reintenta. Si el refresh falla,
/// dispara [onSessionExpired] para que la UI vuelva al login.
class ApiClient {
  final Dio dio;
  final TokenStorage storage;
  void Function()? onSessionExpired;

  Completer<bool>? _refreshing;

  ApiClient(this.storage)
      : dio = Dio(BaseOptions(
          baseUrl: AppConfig.apiBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 20),
        )) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await storage.accessToken;
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (e, handler) async {
        final opts = e.requestOptions;
        final isAuthCall = opts.path.contains('/api/auth/');
        final alreadyRetried = opts.extra['retried'] == true;

        if (e.response?.statusCode == 401 && !isAuthCall && !alreadyRetried) {
          final ok = await _refresh();
          if (ok) {
            opts.extra['retried'] = true;
            final token = await storage.accessToken;
            opts.headers['Authorization'] = 'Bearer $token';
            try {
              return handler.resolve(await dio.fetch(opts));
            } on DioException catch (err) {
              return handler.next(err);
            }
          }
        }
        handler.next(e);
      },
    ));
  }

  Future<bool> _refresh() {
    // Peticiones concurrentes con 401 esperan el mismo refresh
    if (_refreshing != null) return _refreshing!.future;
    final completer = Completer<bool>();
    _refreshing = completer;
    _doRefresh().then((ok) => completer.complete(ok));
    completer.future.whenComplete(() => _refreshing = null);
    return completer.future;
  }

  Future<bool> _doRefresh() async {
    final refresh = await storage.refreshToken;
    if (refresh == null) {
      onSessionExpired?.call();
      return false;
    }
    try {
      // Dio "crudo" sin interceptores para no recursar en el refresh
      final raw = Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl));
      final r = await raw.post('/api/auth/refresh', data: {'refresh_token': refresh});
      await storage.save(r.data['access_token'] as String, r.data['refresh_token'] as String);
      return true;
    } catch (_) {
      await storage.clear();
      onSessionExpired?.call();
      return false;
    }
  }
}
