import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ActionIcon, Drawer, Group, Indicator, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Bell, Menu, Settings, Shapes } from "lucide-react";
import { useAlarms } from "../api/alarms";
import { useGeofences } from "../api/geofences";
import { useTrackToday, useVehicles } from "../api/vehicles";
import { useAuth } from "../auth/AuthProvider";
import { useNow } from "../lib/useNow";
import { vehicleStatus } from "../lib/status";
import { useLiveStore } from "../realtime/liveStore";
import { useRealtime } from "../realtime/useRealtime";
import { NotificationsDrawer } from "../components/NotificationsDrawer";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { LiveMap } from "../components/LiveMap";
import { Sidebar } from "../components/Sidebar";
import { VehicleDetailPanel } from "../components/VehicleDetailPanel";

export default function LiveMapPage() {
  useRealtime();
  const now = useNow();
  const { user } = useAuth();
  const vehiclesQ = useVehicles();
  const alarmsQ = useAlarms();
  const geofencesQ = useGeofences();

  const selectedId = useLiveStore((s) => s.selectedId);
  const select = useLiveStore((s) => s.select);
  const follow = useLiveStore((s) => s.follow);
  const setFollow = useLiveStore((s) => s.setFollow);
  const showTrack = useLiveStore((s) => s.showTrack);
  const toggleTrack = useLiveStore((s) => s.toggleTrack);
  const lastPacketAt = useLiveStore((s) => s.lastPacketAt);

  const [alarmsOpen, alarmsCtl] = useDisclosure(false);
  const [listOpen, listCtl] = useDisclosure(false);

  const vehicles = vehiclesQ.data ?? [];
  const alarms = alarmsQ.data ?? [];
  const geofences = geofencesQ.data ?? [];

  const unackedIds = useMemo(
    () => new Set(alarms.filter((a) => !a.acknowledged).map((a) => a.vehicle_id)),
    [alarms],
  );
  const unackedCount = useMemo(() => alarms.filter((a) => !a.acknowledged).length, [alarms]);

  const selected = vehicles.find((v) => v.id === selectedId) ?? null;
  const trackQ = useTrackToday(selectedId, showTrack);

  const sidebar = (
    <Sidebar
      vehicles={vehicles}
      unackedIds={unackedIds}
      now={now}
      selectedId={selectedId}
      onSelect={(id) => {
        select(id);
        listCtl.close();
      }}
      lastPacketAt={lastPacketAt}
      isLoading={vehiclesQ.isLoading}
      isError={vehiclesQ.isError}
      onRetry={() => vehiclesQ.refetch()}
    />
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebar}</aside>

      <main className="map-area">
        <LiveMap
          vehicles={vehicles}
          unackedIds={unackedIds}
          now={now}
          selectedId={selectedId}
          onSelect={select}
          follow={follow}
          onUserDrag={() => setFollow(false)}
          track={showTrack ? trackQ.data : undefined}
          geofences={geofences}
        />

        <div className="map-float mobile-only" style={{ top: 16, left: 16 }}>
          <ActionIcon
            size={40}
            radius="xl"
            variant="default"
            onClick={listCtl.open}
            aria-label="Abrir lista de motos"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <Menu size={18} />
          </ActionIcon>
        </div>

        <Group className="map-float" style={{ top: 16, right: 16 }} gap={8} wrap="nowrap">
          <ConnectionBadge />
          <Indicator label={unackedCount} size={16} color="red" disabled={unackedCount === 0} offset={4}>
            <ActionIcon
              size={40}
              radius="xl"
              variant="default"
              onClick={alarmsCtl.open}
              aria-label="Ver notificaciones"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <Bell size={18} />
            </ActionIcon>
          </Indicator>
          <Tooltip label="Zonas">
            <ActionIcon
              size={40}
              radius="xl"
              variant="default"
              component={Link}
              to="/geocercas"
              aria-label="Zonas y geocercas"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <Shapes size={18} />
            </ActionIcon>
          </Tooltip>
          {user?.role !== "client" && (
            <Tooltip label="Administración">
              <ActionIcon
                size={40}
                radius="xl"
                variant="default"
                component={Link}
                to="/admin"
                aria-label="Ir a administración"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <Settings size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {selected && (
          <VehicleDetailPanel
            vehicle={selected}
            status={vehicleStatus(selected, unackedIds, now)}
            now={now}
            follow={follow}
            onToggleFollow={() => setFollow(!follow)}
            showTrack={showTrack}
            onToggleTrack={toggleTrack}
            trackLoading={showTrack && trackQ.isLoading}
            trackEmpty={(trackQ.data?.length ?? 0) < 2}
            onClose={() => select(null)}
          />
        )}
      </main>

      <Drawer opened={listOpen} onClose={listCtl.close} position="left" size={320} padding={0} withCloseButton={false} zIndex={2000}>
        <div style={{ height: "100dvh" }}>{sidebar}</div>
      </Drawer>

      <NotificationsDrawer
        opened={alarmsOpen}
        onClose={alarmsCtl.close}
        alarms={alarms}
        vehicles={vehicles}
        now={now}
        onSelectVehicle={select}
      />
    </div>
  );
}
