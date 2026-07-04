/// Parsea un timestamp ISO de la API. Si viene sin zona horaria (naive, caso
/// SQLite en dev), se asume UTC — nunca hora local del dispositivo.
DateTime? parseApiTime(dynamic value) {
  if (value is! String || value.isEmpty) return null;
  final hasTz = RegExp(r'[zZ]$|[+-]\d{2}:?\d{2}$').hasMatch(value);
  return DateTime.tryParse(hasTz ? value : '${value}Z');
}
