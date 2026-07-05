import 'package:flutter/material.dart';

/// Tokens del sistema de diseño — los mismos colores que la web
/// (blanco minimalista, un solo azul de marca, estados sobrios sin neones).
class AppColors {
  AppColors._();

  // Lienzo
  static const bg = Color(0xFFF7F8FA);
  static const surface = Color(0xFFFFFFFF);
  static const border = Color(0xFFE9ECF1);

  // Texto
  static const text = Color(0xFF111827);
  static const textSecondary = Color(0xFF6B7280);
  static const textFaint = Color(0xFF9CA3AF);

  // Marca
  static const primary = Color(0xFF2563EB);
  static const primarySoft = Color(0xFFEFF6FF);

  // Estados (sobrios, mismos que la web)
  static const green = Color(0xFF16A34A);
  static const greenSoft = Color(0xFFF0FDF4);
  static const red = Color(0xFFDC2626);
  static const redSoft = Color(0xFFFEF2F2);
  static const amber = Color(0xFFD97706);
  static const amberSoft = Color(0xFFFFFBEB);
  static const gray = Color(0xFF9CA3AF);
  static const graySoft = Color(0xFFF3F4F6);
}

/// Decoración estándar de tarjeta: borde sutil, sin sombras duras.
BoxDecoration appCard({double radius = 20}) => BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: AppColors.border),
    );
