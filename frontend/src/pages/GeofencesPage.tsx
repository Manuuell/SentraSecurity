import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  ColorInput,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { ArrowLeft, Pencil, Shapes, Trash2 } from "lucide-react";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  Tooltip as LeafletTooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import { latLngBounds } from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useVehicles } from "../api/vehicles";
import { vehicleIcon } from "../components/LiveMap";
import {
  useCreateGeofence,
  useDeleteGeofence,
  useGeofences,
  useSetGeofenceVehicles,
  useUpdateGeofence,
} from "../api/geofences";
import type {
  CircleGeometry,
  Geofence,
  GeofenceGeometry,
  GeofenceKind,
  GeofenceVehicleLink,
  PolygonGeometry,
  Vehicle,
} from "../types";

const CARTAGENA: [number, number] = [10.391, -75.4794];
const COLOR_SWATCHES = ["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#db2777"];

const asCircle = (g: GeofenceGeometry) => g as CircleGeometry;
const asPolygon = (g: GeofenceGeometry) => g as PolygonGeometry;

type Draft = { kind: GeofenceKind; geometry: GeofenceGeometry };
type Assign = Record<string, { enter: boolean; exit: boolean }>;

/** Barra de dibujo de Geoman (círculo/polígono). Al terminar de dibujar, emite
 * la geometría y quita la capa temporal (el guardado la re-renderiza desde el
 * estado de React). Sin edición de forma en v1: para cambiarla, borrar y redibujar. */
function DrawControls({ onDraw }: { onDraw: (d: Draft) => void }) {
  // `pm` lo inyecta Geoman en el mapa de Leaflet vía el import de arriba.
  const map = useMap() as any;
  const cb = useRef(onDraw);
  cb.current = onDraw;

  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawCircle: true,
      drawPolygon: true,
      drawMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircleMarker: false,
      drawText: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });
    const handler = (e: any) => {
      const layer = e.layer;
      if (e.shape === "Circle") {
        const c = layer.getLatLng();
        cb.current({ kind: "circle", geometry: { center: [c.lat, c.lng], radius_m: Math.round(layer.getRadius()) } });
      } else if (e.shape === "Polygon") {
        const ring = layer.getLatLngs()[0] as Array<{ lat: number; lng: number }>;
        cb.current({ kind: "polygon", geometry: { points: ring.map((p) => [p.lat, p.lng]) } });
      }
      layer.remove();
    };
    map.on("pm:create", handler);
    return () => {
      map.off("pm:create", handler);
      try {
        map.pm.removeControls();
      } catch {
        /* el mapa ya se desmontó */
      }
    };
  }, [map]);

  return null;
}

/** Marcadores de la última posición conocida de cada moto, como referencia
 * para saber dónde dibujar la geocerca (misma flecha que el mapa en vivo). */
function VehicleMarkers({ vehicles }: { vehicles: Vehicle[] }) {
  return (
    <>
      {vehicles
        .filter((v) => v.last_lat != null && v.last_lon != null)
        .map((v) => (
          <Marker
            key={v.id}
            position={[v.last_lat!, v.last_lon!]}
            icon={vehicleIcon("#64748b", v.last_direction ?? 0, false)}
            interactive={false}
          >
            {/* Permanente: como el marcador no es interactivo (para no estorbar
                al dibujar), el nombre debe verse sin necesidad de hover. */}
            <LeafletTooltip permanent direction="top" offset={[0, -14]}>
              {v.name || v.id}
            </LeafletTooltip>
          </Marker>
        ))}
    </>
  );
}

/** Al entrar, encuadra el mapa sobre las motos (una → zoom cercano; varias →
 * bounds) para no empezar en la vista genérica de la ciudad. Se hace una sola
 * vez: después no reencuadra aunque lleguen posiciones nuevas por el WS. */
function FitToVehicles({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const withPos = vehicles.filter((v) => v.last_lat != null && v.last_lon != null);
    if (withPos.length === 0) return;
    done.current = true;
    // El mapa está en un contenedor flex que puede medirse tarde: sin esto,
    // fitBounds encuadra con dimensiones viejas y las motos quedan al borde.
    map.invalidateSize();
    if (withPos.length === 1) {
      map.setView([withPos[0].last_lat!, withPos[0].last_lon!], 15);
    } else {
      map.fitBounds(
        latLngBounds(withPos.map((v) => [v.last_lat!, v.last_lon!] as [number, number])),
        { padding: [56, 56], maxZoom: 15 },
      );
    }
  }, [vehicles, map]);

  return null;
}

export default function GeofencesPage() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const geofencesQ = useGeofences();
  const vehiclesQ = useVehicles();
  const update = useUpdateGeofence();
  const del = useDeleteGeofence();

  const geofences = geofencesQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Geofence | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Geofence | null>(null);

  const mapDivStyle = isMobile
    ? { height: "45vh", flexShrink: 0, position: "relative" as const }
    : { flex: 1, position: "relative" as const };
  const asideStyle = isMobile
    ? { flex: 1, minHeight: 0, borderTop: "1px solid var(--border)" }
    : { width: 360, minHeight: 0, borderLeft: "1px solid var(--border)" };

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <Group
        px="md"
        py="sm"
        justify="space-between"
        wrap="nowrap"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <Group gap={10} wrap="nowrap">
          <ActionIcon component={Link} to="/" variant="subtle" color="gray" size="lg" aria-label="Volver al mapa">
            <ArrowLeft size={20} />
          </ActionIcon>
          <div style={{ minWidth: 0 }}>
            <Text fw={700} fz={18}>
              Zonas (geocercas)
            </Text>
            <Text fz={12} c="dimmed">
              Dibuja un círculo o polígono y recibe avisos cuando una moto entre o salga.
            </Text>
          </div>
        </Group>
      </Group>

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: 0 }}>
        <div style={mapDivStyle}>
          <MapContainer center={CARTAGENA} zoom={13} zoomControl={false} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <ZoomControl position="bottomright" />
            <DrawControls onDraw={setDraft} />
            <FitToVehicles vehicles={vehicles} />
            <VehicleMarkers vehicles={vehicles} />
            {geofences.map((gf) => {
              const opts = {
                color: gf.color,
                weight: selectedId === gf.id ? 4 : 2,
                fillColor: gf.color,
                fillOpacity: gf.is_active ? 0.12 : 0.04,
                dashArray: gf.is_active ? undefined : "6 6",
              };
              const handlers = { click: () => setSelectedId(gf.id) };
              return gf.kind === "circle" ? (
                <Circle
                  key={gf.id}
                  center={asCircle(gf.geometry).center}
                  radius={asCircle(gf.geometry).radius_m}
                  pathOptions={opts}
                  eventHandlers={handlers}
                >
                  <LeafletTooltip>{gf.name}</LeafletTooltip>
                </Circle>
              ) : (
                <Polygon key={gf.id} positions={asPolygon(gf.geometry).points} pathOptions={opts} eventHandlers={handlers}>
                  <LeafletTooltip>{gf.name}</LeafletTooltip>
                </Polygon>
              );
            })}
          </MapContainer>
        </div>

        <aside style={{ ...asideStyle, background: "var(--surface)", display: "flex", flexDirection: "column" }}>
          {geofencesQ.isLoading ? (
            <Group p="md">
              <Loader size="sm" />
            </Group>
          ) : (
            <GeofenceList
              geofences={geofences}
              vehicles={vehicles}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={setEditing}
              onToggleActive={(gf) => update.mutate({ id: gf.id, is_active: !gf.is_active })}
              onDelete={setConfirmDelete}
            />
          )}
        </aside>
      </div>

      <GeofenceFormModal
        opened={draft !== null || editing !== null}
        draft={draft}
        editing={editing}
        vehicles={vehicles}
        onClose={() => {
          setDraft(null);
          setEditing(null);
        }}
      />

      <Modal
        opened={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar zona"
        centered
        radius="lg"
        zIndex={2000}
      >
        <Text fz={14}>
          ¿Eliminar la zona <b>{confirmDelete?.name}</b>? Se dejará de vigilar y de avisar.
        </Text>
        <Group justify="flex-end" gap="xs" mt="md">
          <Button variant="default" onClick={() => setConfirmDelete(null)}>
            Cancelar
          </Button>
          <Button
            color="red"
            loading={del.isPending}
            onClick={() => {
              if (!confirmDelete) return;
              const id = confirmDelete.id;
              del.mutate(id, {
                onSuccess: () => {
                  if (selectedId === id) setSelectedId(null);
                  setConfirmDelete(null);
                },
              });
            }}
          >
            Eliminar
          </Button>
        </Group>
      </Modal>
    </div>
  );
}

interface ListProps {
  geofences: Geofence[];
  vehicles: Vehicle[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onEdit: (gf: Geofence) => void;
  onToggleActive: (gf: Geofence) => void;
  onDelete: (gf: Geofence) => void;
}

function GeofenceList({ geofences, vehicles, selectedId, onSelect, onEdit, onToggleActive, onDelete }: ListProps) {
  const vname = useMemo(() => new Map(vehicles.map((v) => [v.id, v.name || v.id])), [vehicles]);

  if (geofences.length === 0) {
    return (
      <Stack align="center" py={48} px="md" gap={8}>
        <Shapes size={30} color="var(--text-faint)" strokeWidth={1.5} />
        <Text fw={600} fz={14}>
          Sin zonas todavía
        </Text>
        <Text fz={12} c="dimmed" ta="center">
          Usa las herramientas de dibujo (arriba a la izquierda del mapa) para crear la primera.
        </Text>
      </Stack>
    );
  }

  return (
    <ScrollArea style={{ flex: 1 }}>
      <Stack gap={8} p="sm">
        {geofences.map((gf) => (
          <Paper
            key={gf.id}
            p="sm"
            radius="md"
            withBorder
            onClick={() => onSelect(gf.id)}
            style={{ borderColor: selectedId === gf.id ? gf.color : "var(--border)", cursor: "pointer" }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: gf.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <Text fz={13} fw={600} truncate>
                    {gf.name}
                  </Text>
                  <Text fz={11} c="dimmed">
                    {gf.kind === "circle" ? "Círculo" : "Polígono"} · {gf.vehicles.length} moto(s)
                  </Text>
                </div>
              </Group>
              <Group gap={2} wrap="nowrap">
                <Switch
                  size="xs"
                  checked={gf.is_active}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleActive(gf)}
                  aria-label="Zona activa"
                />
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Editar"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(gf);
                  }}
                >
                  <Pencil size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label="Eliminar"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(gf);
                  }}
                >
                  <Trash2 size={14} />
                </ActionIcon>
              </Group>
            </Group>
            {gf.vehicles.length > 0 && (
              <Group gap={4} mt={6}>
                {gf.vehicles.map((l) => (
                  <Badge key={l.vehicle_id} size="xs" variant="light" color="gray">
                    {vname.get(l.vehicle_id) ?? l.vehicle_id}
                  </Badge>
                ))}
              </Group>
            )}
          </Paper>
        ))}
      </Stack>
    </ScrollArea>
  );
}

interface FormProps {
  opened: boolean;
  draft: Draft | null;
  editing: Geofence | null;
  vehicles: Vehicle[];
  onClose: () => void;
}

function GeofenceFormModal({ opened, draft, editing, vehicles, onClose }: FormProps) {
  const create = useCreateGeofence();
  const update = useUpdateGeofence();
  const setVehicles = useSetGeofenceVehicles();

  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [assign, setAssign] = useState<Assign>({});

  useEffect(() => {
    if (!opened) return;
    if (editing) {
      setName(editing.name);
      setColor(editing.color);
      const a: Assign = {};
      editing.vehicles.forEach((l) => (a[l.vehicle_id] = { enter: l.notify_enter, exit: l.notify_exit }));
      setAssign(a);
    } else {
      setName("");
      setColor("#2563eb");
      setAssign({});
    }
  }, [opened, editing]);

  const kind = editing?.kind ?? draft?.kind;
  const busy = create.isPending || update.isPending || setVehicles.isPending;

  const links = (): GeofenceVehicleLink[] =>
    Object.entries(assign).map(([vehicle_id, v]) => ({
      vehicle_id,
      notify_enter: v.enter,
      notify_exit: v.exit,
    }));

  const save = async () => {
    if (editing) {
      await update.mutateAsync({ id: editing.id, name: name.trim() || editing.name, color });
      await setVehicles.mutateAsync({ id: editing.id, vehicles: links() });
    } else if (draft) {
      await create.mutateAsync({
        name: name.trim() || "Zona",
        kind: draft.kind,
        geometry: draft.geometry,
        color,
        vehicles: links(),
      });
    }
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? "Editar zona" : "Nueva zona"}
      centered
      radius="lg"
      zIndex={2000}
    >
      <Stack gap="sm">
        <TextInput
          label="Nombre"
          placeholder="Casa, Trabajo, Parqueadero…"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
        />
        <ColorInput label="Color" value={color} onChange={setColor} swatches={COLOR_SWATCHES} format="hex" />

        <div>
          <Text fz={13} fw={600}>
            Motos y avisos
          </Text>
          <Text fz={11} c="dimmed" mb={8}>
            Elige qué motos vigila esta zona y si avisar al entrar, al salir, o ambos.
          </Text>
          <Stack gap={6}>
            {vehicles.length === 0 && (
              <Text fz={12} c="dimmed">
                No tienes motos asignadas.
              </Text>
            )}
            {vehicles.map((v) => {
              const a = assign[v.id];
              return (
                <Paper key={v.id} p={8} radius="md" withBorder>
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                      <Switch
                        size="xs"
                        checked={!!a}
                        onChange={(e) =>
                          setAssign((p) => {
                            const n = { ...p };
                            if (e.currentTarget.checked) n[v.id] = { enter: true, exit: true };
                            else delete n[v.id];
                            return n;
                          })
                        }
                      />
                      <Text fz={13} truncate>
                        {v.name || v.id}
                      </Text>
                    </Group>
                    {a && (
                      <Group gap={12} wrap="nowrap">
                        <Switch
                          size="xs"
                          label="Entra"
                          checked={a.enter}
                          onChange={(e) =>
                            setAssign((p) => ({ ...p, [v.id]: { ...p[v.id], enter: e.currentTarget.checked } }))
                          }
                        />
                        <Switch
                          size="xs"
                          label="Sale"
                          checked={a.exit}
                          onChange={(e) =>
                            setAssign((p) => ({ ...p, [v.id]: { ...p[v.id], exit: e.currentTarget.checked } }))
                          }
                        />
                      </Group>
                    )}
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </div>

        {kind && (
          <Text fz={11} c="dimmed">
            Forma: {kind === "circle" ? "círculo" : "polígono"}
            {editing ? " · para cambiar la forma, elimina la zona y vuelve a dibujarla" : ""}.
          </Text>
        )}

        {(create.isError || update.isError || setVehicles.isError) && (
          <Text fz={12} c="red">
            No se pudo guardar. Intenta de nuevo.
          </Text>
        )}

        <Group justify="flex-end" gap="xs" mt={4}>
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            {editing ? "Guardar" : "Crear zona"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
