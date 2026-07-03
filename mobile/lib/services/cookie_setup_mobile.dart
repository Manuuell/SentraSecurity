import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';

Future<void> setupCookies(Dio dio) async {
  final jar = CookieJar();
  dio.interceptors.add(CookieManager(jar));
}
