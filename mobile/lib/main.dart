import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'core/push_service.dart';
import 'state/sentra_service.dart';
import 'screens/login_screen.dart';
import 'screens/main_shell.dart';
import 'ui/tokens.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  timeago.setLocaleMessages('es', timeago.EsMessages());
  timeago.setLocaleMessages('es_short', timeago.EsShortMessages());
  await initializeDateFormatting('es');
  await PushService.instance.init();
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
      locale: const Locale('es'),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('es'), Locale('en')],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: AppColors.bg,
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.text,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: AppColors.surface,
          surfaceTintColor: Colors.transparent,
          indicatorColor: AppColors.primarySoft,
          height: 68,
          labelTextStyle: WidgetStatePropertyAll(
            const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary),
          ),
          iconTheme: WidgetStateProperty.resolveWith(
            (states) => IconThemeData(
              size: 24,
              color: states.contains(WidgetState.selected)
                  ? AppColors.primary
                  : AppColors.textFaint,
            ),
          ),
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
        backgroundColor: AppColors.surface,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset('assets/images/logo_full.png', width: 220),
              const SizedBox(height: 12),
              const Text('Monitoreo GPS · Cartagena',
                  style: TextStyle(fontSize: 13, color: AppColors.textFaint)),
              const SizedBox(height: 24),
              const SizedBox(
                width: 22, height: 22,
                child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2.5),
              ),
            ],
          ),
        ),
      );
}
