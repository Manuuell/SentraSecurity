import 'package:flutter/material.dart';
import '../data/models/vehicle.dart';
import 'tokens.dart';

/// Estado visual del vehículo, en lenguaje que cualquier persona entiende.
enum VehicleUiStatus { moving, idle, offline, alert }

VehicleUiStatus statusFor(Vehicle v, Set<String> alertedIds) {
  if (alertedIds.contains(v.id)) return VehicleUiStatus.alert;
  if (!v.isOnline) return VehicleUiStatus.offline;
  if (v.isMoving) return VehicleUiStatus.moving;
  return VehicleUiStatus.idle;
}

extension VehicleUiStatusX on VehicleUiStatus {
  Color get color => switch (this) {
        VehicleUiStatus.moving => AppColors.green,
        VehicleUiStatus.idle => AppColors.primary,
        VehicleUiStatus.offline => AppColors.gray,
        VehicleUiStatus.alert => AppColors.red,
      };

  Color get soft => switch (this) {
        VehicleUiStatus.moving => AppColors.greenSoft,
        VehicleUiStatus.idle => AppColors.primarySoft,
        VehicleUiStatus.offline => AppColors.graySoft,
        VehicleUiStatus.alert => AppColors.redSoft,
      };

  String get label => switch (this) {
        VehicleUiStatus.moving => 'En movimiento',
        VehicleUiStatus.idle => 'Detenida',
        VehicleUiStatus.offline => 'Sin señal',
        VehicleUiStatus.alert => 'Alerta activa',
      };

  /// Frase larga para la tarjeta principal (patrón Monimoto: "todo en orden").
  String get phrase => switch (this) {
        VehicleUiStatus.moving => 'Tu moto está en movimiento',
        VehicleUiStatus.idle => 'Todo en orden',
        VehicleUiStatus.offline => 'El rastreador no reporta',
        VehicleUiStatus.alert => 'Revisa las alertas',
      };

  IconData get icon => switch (this) {
        VehicleUiStatus.moving => Icons.navigation_rounded,
        VehicleUiStatus.idle => Icons.check_circle_rounded,
        VehicleUiStatus.offline => Icons.wifi_off_rounded,
        VehicleUiStatus.alert => Icons.warning_amber_rounded,
      };
}
