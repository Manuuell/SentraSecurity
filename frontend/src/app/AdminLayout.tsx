import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { Group, Text, UnstyledButton } from "@mantine/core";
import {
  Bell,
  LayoutDashboard,
  LogOut,
  MapPin,
  Radio,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/admin", label: "Panel", icon: <LayoutDashboard size={18} />, end: true },
  { to: "/admin/devices", label: "Dispositivos", icon: <Smartphone size={18} /> },
  { to: "/admin/events", label: "Alertas", icon: <Bell size={18} /> },
  { to: "/admin/provisioning", label: "Aprovisionamiento", icon: <Radio size={18} /> },
  { to: "/admin/users", label: "Usuarios", icon: <Users size={18} /> },
];

const TITLES: Record<string, string> = {
  "/admin": "Panel de control",
  "/admin/devices": "Dispositivos",
  "/admin/events": "Alertas",
  "/admin/provisioning": "Aprovisionamiento de rastreadores",
  "/admin/users": "Usuarios y clientes",
};

export function AdminLayout() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const title = pathname.startsWith("/admin/devices/")
    ? "Detalle del dispositivo"
    : TITLES[pathname] ?? "Administración";

  // El panel es solo para roles de empresa
  if (user?.role === "client") return <Navigate to="/" replace />;

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <Group gap={10} px="md" py="lg" wrap="nowrap">
          <div className="admin-logo">
            <ShieldCheck size={20} color="var(--accent)" />
          </div>
          <div>
            <Text fw={800} fz={15} lh={1.2}>
              SentraSecurity
            </Text>
            <Text fz={11} c="dimmed">
              Administración
            </Text>
          </div>
        </Group>

        <nav className="admin-nav-list">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-item${isActive ? " is-active" : ""}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <NavLink to="/" className="admin-nav-item admin-nav-back">
          <MapPin size={18} />
          <span>Volver al mapa</span>
        </NavLink>
        <UnstyledButton className="admin-nav-item" mb={8} mx={8} onClick={() => logout()}>
          <LogOut size={18} />
          <span>Cerrar sesión ({user?.full_name || user?.email})</span>
        </UnstyledButton>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <Text fw={700} fz={20}>
            {title}
          </Text>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
