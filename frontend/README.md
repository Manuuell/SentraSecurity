# SentraSecurity — Frontend web

React 18 + TypeScript + Vite + Mantine + Leaflet. Tema claro minimalista.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000 (proxy /api → localhost:8000)
```

Requiere el backend FastAPI corriendo en el puerto 8000:

```bash
# desde la raíz del proyecto
uvicorn server.main:app --reload --port 8000
```

Para probar sin trackers reales hay un simulador de ST-907L en el plan de
trabajo (envía tramas Totem al TCP 8090).

## Build de producción

```bash
npm run build        # type-check (tsc) + bundle en dist/
```

En producción `dist/` se sirve como estático detrás del reverse proxy (Caddy),
que también proxya `/api` y `/api/ws` al backend — no se necesita configurar
`VITE_API_URL` (mismo origen). Ver `.env.example`.

## Estructura

```
src/
├── api/         # axios + hooks TanStack Query (vehicles, alarms)
├── realtime/    # WebSocket con reconexión/backoff + store Zustand
├── lib/         # formato es-CO, estados del vehículo, reloj
├── components/  # Sidebar, LiveMap, VehicleDetailPanel, AlarmsDrawer…
├── pages/       # LiveMapPage (mapa en vivo)
└── styles/      # tema Mantine + CSS global
```

Pendiente (según PLAN_DE_TRABAJO.md): login/JWT cuando el backend tenga auth
(Fase 1), histórico con reproducción, clustering de marcadores, i18next.
