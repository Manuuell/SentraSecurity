const rtf = new Intl.RelativeTimeFormat("es-CO", { numeric: "auto" });
const timeFmt = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Parsea un timestamp ISO del backend. Si viene sin zona horaria (naive),
 * se asume UTC — nunca hora local del navegador.
 */
export function parseTs(iso: string): number {
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso);
  return Date.parse(hasTz ? iso : `${iso}Z`);
}

/**
 * ISO naive en UTC (sin sufijo Z) para query params de la API.
 * El backend actual compara contra timestamps naive-UTC; cuando la Fase 1
 * normalice a aware-UTC, basta con devolver el toISOString() completo.
 */
export function toNaiveUtcIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/** "hace 5 min", "hace 2 h", "ayer"… a partir de un ISO timestamp. */
export function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "nunca";
  const diffSec = Math.round((parseTs(iso) - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "ahora";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86_400), "day");
}

export function fmtTime(iso: string | null): string {
  return iso ? timeFmt.format(new Date(parseTs(iso))) : "—";
}

export function fmtDateTime(iso: string | null): string {
  return iso ? dateTimeFmt.format(new Date(parseTs(iso))) : "—";
}

export function fmtSpeed(kmh: number | null | undefined): string {
  return kmh != null ? `${Math.round(kmh)} km/h` : "—";
}
