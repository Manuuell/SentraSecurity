import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Tokens en almacenamiento seguro (Keychain en iOS, Keystore en Android).
/// El access token se cachea en memoria para no leer el storage en cada request.
class TokenStorage {
  static const _storage = FlutterSecureStorage();
  static const _kAccess = 'sentra_access';
  static const _kRefresh = 'sentra_refresh';

  String? _accessCache;

  Future<void> save(String access, String refresh) async {
    _accessCache = access;
    await _storage.write(key: _kAccess, value: access);
    await _storage.write(key: _kRefresh, value: refresh);
  }

  Future<String?> get accessToken async =>
      _accessCache ??= await _storage.read(key: _kAccess);

  Future<String?> get refreshToken => _storage.read(key: _kRefresh);

  Future<bool> get hasSession async => (await refreshToken) != null;

  Future<void> clear() async {
    _accessCache = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
  }
}
