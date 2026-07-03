import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/traccar_service.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => TraccarService(),
      child: const SentraApp(),
    ),
  );
}

class SentraApp extends StatelessWidget {
  const SentraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SentraSecurity GPS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF4A90D9),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F8FA),
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: Color(0xFF3C3C3C),
          elevation: 0,
          surfaceTintColor: Colors.transparent,
        ),
        cardTheme: CardTheme(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      home: const LoginScreen(),
    );
  }
}
