import React, { Suspense, lazy, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader, MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mantine/core/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles/index.css";
import { theme } from "./styles/theme";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import LiveMapPage from "./pages/LiveMapPage";
import { AdminLayout } from "./app/AdminLayout";

// El área admin se carga bajo demanda: mantiene liviano el bundle del mapa en vivo
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const DevicesPage = lazy(() => import("./pages/admin/DevicesPage"));
const DeviceDetailPage = lazy(() => import("./pages/admin/DeviceDetailPage"));
const EventsPage = lazy(() => import("./pages/admin/EventsPage"));
const ProvisioningPage = lazy(() => import("./pages/admin/ProvisioningPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function CenteredLoader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60dvh" }}>
      <Loader size="sm" />
    </div>
  );
}

/** Splash durante el refresh inicial de sesión; luego deja pasar al router. */
function AuthGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  if (loading) return <CenteredLoader />;
  return <>{children}</>;
}

/** Requiere sesión; si no hay, manda a /login. Usado por las rutas internas. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const { user } = useAuth();
  return user ? <LiveMapPage /> : <LandingPage />;
}

function LoginRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        <AuthProvider>
          <AuthGate>
            <BrowserRouter>
              <Suspense fallback={<CenteredLoader />}>
                <Routes>
                  <Route path="/" element={<HomeRoute />} />
                  <Route path="/login" element={<LoginRoute />} />
                  <Route
                    path="/admin"
                    element={
                      <RequireAuth>
                        <AdminLayout />
                      </RequireAuth>
                    }
                  >
                    <Route index element={<DashboardPage />} />
                    <Route path="devices" element={<DevicesPage />} />
                    <Route path="devices/:id" element={<DeviceDetailPage />} />
                    <Route path="events" element={<EventsPage />} />
                    <Route path="provisioning" element={<ProvisioningPage />} />
                    <Route path="users" element={<UsersPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthGate>
        </AuthProvider>
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
