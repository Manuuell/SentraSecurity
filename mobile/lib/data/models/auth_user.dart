class AuthUser {
  final int id;
  final String email;
  final String fullName;
  final String? phone;
  final String role; // admin | operator | client

  const AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    this.phone,
    required this.role,
  });

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: j['id'] as int,
        email: j['email'] as String,
        fullName: (j['full_name'] as String?) ?? '',
        phone: j['phone'] as String?,
        role: j['role'] as String? ?? 'client',
      );

  String get roleLabel => switch (role) {
        'admin' => 'Administrador',
        'operator' => 'Operador',
        _ => 'Cliente',
      };
}
