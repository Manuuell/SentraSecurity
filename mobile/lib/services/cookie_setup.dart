import 'package:dio/dio.dart';
import 'cookie_setup_stub.dart' if (dart.library.io) 'cookie_setup_mobile.dart';

Future<void> addCookieSupport(Dio dio) => setupCookies(dio);
