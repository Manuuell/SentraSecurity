import { parseTs } from "./format";
import type { TrackPoint } from "../types";

/**
 * Ajuste del trazo GPS a la red vial (map matching) con OSRM.
 *
 * Con VITE_OSRM_URL definido se usa el OSRM propio (contenedor con el
 * extracto de Colombia en el VPS): ventanas grandes y sin pausas.
 * Sin la variable cae al servidor DEMO público — solo para desarrollo:
 * limita el matching a 10 coordenadas por petición, sin SLA, y no se le
 * deben enviar recorridos de clientes reales.
 */
const SELF_HOSTED_URL = import.meta.env.VITE_OSRM_URL as string | undefined;
const OSRM_BASE = SELF_HOSTED_URL || "https://router.project-osrm.org";

/** Demo público: 11+ coordenadas → TooBig (verificado). Propio: 100 por URL manejable. */
const CHUNK_SIZE = SELF_HOSTED_URL ? 100 : 10;
/** Tope de peticiones por trazo. */
const MAX_CHUNKS = SELF_HOSTED_URL ? 6 : 8;
/** Pausa entre peticiones secuenciales (cortesía con el demo público). */
const CHUNK_DELAY_MS = SELF_HOSTED_URL ? 0 : 150;

type LatLng = [number, number];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function matchChunk(chunk: TrackPoint[]): Promise<LatLng[][]> {
  const coords = chunk.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  // Radio de búsqueda por punto (m): tolera el error típico del GPS del tracker
  const radiuses = chunk.map(() => "30").join(";");
  // Los timestamps ayudan al modelo de matching a descartar rutas implausibles
  const timestamps = chunk.map((p) => Math.floor(parseTs(p.timestamp) / 1000)).join(";");
  const res = await fetch(
    `${OSRM_BASE}/match/v1/driving/${coords}?geometries=geojson&overview=full&gaps=split&radiuses=${radiuses}&timestamps=${timestamps}`,
  );
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    matchings?: { geometry: { coordinates: [number, number][] } }[];
  };
  if (data.code !== "Ok" || !data.matchings?.length) {
    throw new Error(`OSRM sin correspondencia (${data.code})`);
  }
  return data.matchings.map((m) =>
    m.geometry.coordinates.map(([lon, lat]) => [lat, lon] as LatLng),
  );
}

/**
 * Devuelve la geometría ajustada a vías como lista de segmentos [lat, lon].
 * La traza se muestrea y se trocea en ventanas de CHUNK_SIZE puntos con un
 * punto de solape; cada ventana se ajusta por separado y los tramos contiguos
 * se unen. Si una ventana falla, ese tramo cae al trazo GPS crudo (mejor un
 * tramo crudo que perder todo el ajuste).
 */
export async function matchTrackToRoads(track: TrackPoint[]): Promise<LatLng[][]> {
  // Muestreo global para caber en MAX_CHUNKS ventanas
  const maxSampled = MAX_CHUNKS * (CHUNK_SIZE - 1) + 1;
  const step = Math.max(1, Math.ceil(track.length / maxSampled));
  const sampled = track.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== track[track.length - 1]) {
    sampled.push(track[track.length - 1]);
  }
  // OSRM exige timestamps monótonamente crecientes: descartar repetidos
  for (let i = sampled.length - 1; i > 0; i -= 1) {
    if (parseTs(sampled[i].timestamp) <= parseTs(sampled[i - 1].timestamp)) {
      sampled.splice(i, 1);
    }
  }
  if (sampled.length < 2) throw new Error("trazo insuficiente");

  // Ventanas con un punto de solape para que los tramos empalmen
  const chunks: TrackPoint[][] = [];
  for (let start = 0; start < sampled.length - 1; start += CHUNK_SIZE - 1) {
    chunks.push(sampled.slice(start, start + CHUNK_SIZE));
  }

  // Cada matching se dibuja como polyline independiente. NUNCA se puentean
  // tramos con líneas rectas: en calles paralelas de ida/vuelta (p. ej.
  // Bocagrande) el puente cruza la manzana y fabrica recorridos falsos;
  // un hueco de pocos metros entre polylines es imperceptible.
  const segments: LatLng[][] = [];
  let anyMatched = false;
  for (const chunk of chunks) {
    if (chunk.length < 2) continue;
    try {
      const matched = await matchChunk(chunk);
      for (const seg of matched) {
        if (seg.length > 1) segments.push(seg);
      }
      anyMatched = true;
    } catch {
      // Fallback por tramo: trazo crudo de esta ventana
      segments.push(chunk.map((p) => [p.lat, p.lon] as LatLng));
    }
    if (chunks.length > 1) await sleep(CHUNK_DELAY_MS);
  }

  if (!anyMatched) throw new Error("OSRM no disponible");
  return segments;
}
