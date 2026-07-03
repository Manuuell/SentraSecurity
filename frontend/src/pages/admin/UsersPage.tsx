import { List, Stack, Text, ThemeIcon } from "@mantine/core";
import { Lock, UserPlus } from "lucide-react";

export default function UsersPage() {
  return (
    <div className="admin-card" style={{ maxWidth: 640 }}>
      <Stack gap="md">
        <ThemeIcon size={48} radius="md" variant="light" color="gray">
          <Lock size={24} />
        </ThemeIcon>
        <div>
          <Text fw={700} fz={18}>
            Gestión de usuarios y clientes
          </Text>
          <Text fz={14} c="dimmed" mt={4}>
            Esta sección requiere la capa de autenticación y el modelo de usuarios del backend
            (Fase 1 del plan de trabajo). Aún no está disponible porque la API actual no expone
            usuarios, roles ni asignación de motos a clientes.
          </Text>
        </div>

        <div>
          <Text fw={600} fz={14} mb={8}>
            Cuando el backend esté listo, aquí se podrá:
          </Text>
          <List
            spacing={6}
            size="sm"
            icon={
              <ThemeIcon size={18} radius="xl" variant="light" color="blue">
                <UserPlus size={12} />
              </ThemeIcon>
            }
          >
            <List.Item>Dar de alta clientes (B2C) con correo y teléfono.</List.Item>
            <List.Item>Asignar una o varias motos a cada cliente (tabla user_vehicles).</List.Item>
            <List.Item>Gestionar roles: administrador, operador y cliente.</List.Item>
            <List.Item>Restablecer contraseñas y desactivar cuentas.</List.Item>
          </List>
        </div>

        <Text fz={12} c="dimmed">
          Ver <b>PLAN_DE_TRABAJO.md</b> §5.1 (modelo de datos) y §2 ADR-4 (autenticación).
        </Text>
      </Stack>
    </div>
  );
}
