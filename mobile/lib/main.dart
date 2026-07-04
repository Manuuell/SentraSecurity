import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'state/sentra_service.dart';
import 'screens/login_screen.dart';
import 'screens/main_shell.dart';

void main() {
  timeago.setLocaleMessages('es', timeago.EsMessages());
  runApp(
    ChangeNotifierProvider(
      create: (_) => SentraService(),
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
      ),
      home: const RootGate(),
    );
  }
}

/// Decide splash → login o shell según la sesión, y reacciona a login/logout.
class RootGate extends StatefulWidget {
  const RootGate({super.key});

  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  late final AppLifecycleListener _lifecycle;
  bool _restored = false;

  @override
  void initState() {
    super.initState();
    final svc = context.read<SentraService>();
    _lifecycle = AppLifecycleListener(
      onResume: svc.onAppResumed,
      onPause: svc.onAppPaused,
    );
    svc.tryRestoreSession().whenComplete(() {
      if (mounted) setState(() => _restored = true);
    });
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_restored) return const _Splash();
    return Consumer<SentraService>(
      builder: (_, svc, __) =>
          svc.authenticated ? const MainShell() : const LoginScreen(),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  color: const Color(0xFF4A90D9).withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.gps_fixed, color: Color(0xFF4A90D9), size: 46),
              ),
              const SizedBox(height: 20),
              const Text('SentraSecurity',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF3C3C3C))),
              const SizedBox(height: 20),
              const SizedBox(
                width: 22, height: 22,
                child: CircularProgressIndicator(color: Color(0xFF4A90D9), strokeWidth: 2.5),
              ),
            ],
          ),
        ),
      );
}
