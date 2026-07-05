import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/sentra_service.dart';
import '../ui/tokens.dart';
import 'home_screen.dart';
import 'map_all_screen.dart';
import 'alerts_screen.dart';
import 'settings_screen.dart';

enum _Tab { home, map, alerts, settings }

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  _Tab _current = _Tab.home;

  Widget _screenFor(_Tab tab) => switch (tab) {
        _Tab.home => const HomeScreen(),
        _Tab.map => const MapAllScreen(),
        _Tab.alerts => const AlertsScreen(),
        _Tab.settings => const SettingsScreen(),
      };

  NavigationDestination _destinationFor(_Tab tab, int unacked) => switch (tab) {
        _Tab.home => const NavigationDestination(
            icon: Icon(Icons.two_wheeler_outlined),
            selectedIcon: Icon(Icons.two_wheeler),
            label: 'Mis motos',
          ),
        _Tab.map => const NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map),
            label: 'Mapa',
          ),
        _Tab.alerts => NavigationDestination(
            icon: Badge(
              isLabelVisible: unacked > 0,
              label: Text('${unacked > 9 ? "9+" : unacked}'),
              backgroundColor: AppColors.red,
              child: const Icon(Icons.notifications_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: unacked > 0,
              label: Text('${unacked > 9 ? "9+" : unacked}'),
              backgroundColor: AppColors.red,
              child: const Icon(Icons.notifications),
            ),
            label: 'Alertas',
          ),
        _Tab.settings => const NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings_rounded),
            label: 'Ajustes',
          ),
      };

  @override
  Widget build(BuildContext context) {
    final vehicleCount = context.select<SentraService, int>((s) => s.vehicles.length);
    final unacked = context.select<SentraService, int>((s) => s.unacknowledgedCount);

    // El mapa de flota solo aporta con 2+ motos; con una sola, el minimapa
    // en vivo del tab principal ya la muestra.
    final tabs = [
      _Tab.home,
      if (vehicleCount > 1) _Tab.map,
      _Tab.alerts,
      _Tab.settings,
    ];
    final current = tabs.contains(_current) ? _current : _Tab.home;
    final index = tabs.indexOf(current);

    return Scaffold(
      body: IndexedStack(index: index, children: [for (final t in tabs) _screenFor(t)]),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (i) => setState(() => _current = tabs[i]),
          destinations: [for (final t in tabs) _destinationFor(t, unacked)],
        ),
      ),
    );
  }
}
