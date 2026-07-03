import { createTheme, type MantineColorsTuple } from "@mantine/core";

const brand: MantineColorsTuple = [
  "#eff6ff",
  "#dbeafe",
  "#bfdbfe",
  "#93c5fd",
  "#60a5fa",
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
  "#1e40af",
  "#1e3a8a",
];

export const theme = createTheme({
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  headings: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: "700",
  },
  colors: { brand },
  primaryColor: "brand",
  primaryShade: 6,
  defaultRadius: "md",
  cursorType: "pointer",
  components: {
    Button: { defaultProps: { fw: 600 } },
    Tooltip: { defaultProps: { withArrow: true } },
  },
});

/** Colores de estado del vehículo — únicos colores fuertes sobre el lienzo blanco. */
export const STATUS_COLORS = {
  moving: "#16a34a",
  idle: "#2563eb",
  offline: "#9ca3af",
  alarm: "#dc2626",
} as const;
