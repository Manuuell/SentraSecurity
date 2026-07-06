<p align="center">
  <img src="frontend/public/logo-full.png" alt="SentraSecurity" width="420">
</p>

<p align="center">
  Monitoreo GPS en tiempo real y corte remoto de motor, con web y app móvil propias.
</p>

<p align="center">
  <a href="https://github.com/Manuuell/SentraSecurity/actions/workflows/deploy.yml">
    <img src="https://github.com/Manuuell/SentraSecurity/actions/workflows/deploy.yml/badge.svg" alt="CI/CD">
  </a>
</p>

---

## Qué es

SentraSecurity es una plataforma propia (sin depender de Traccar ni de terceros) para
rastrear vehículos en vivo y protegerlos ante un robo: posición en tiempo real, histórico
de recorridos, alertas (emergencia, desplazamiento sin encendido, exceso de velocidad,
batería baja) y **corte remoto de motor** desde la web o la app móvil, con confirmación
por SMS del dispositivo. Los rastreadores usados son SinoTrack ST-907L.

En producción: **https://sentrasecurity.duckdns.org**

## Stack

| Parte | Tecnología |
|---|---|
| Backend | FastAPI + PostgreSQL (SQLite en local) + SQLAlchemy async + WebSocket + ingestión TCP de los trackers |
| Frontend web | React + Vite + TypeScript + Mantine + Leaflet |
| App móvil | Flutter (Android/iOS/web) |
| Rutas | OSRM propio (ajuste de posiciones a vías) |
| Infraestructura | Docker Compose + GitHub Actions (CI/CD) sobre un VPS con Nginx/Let's Encrypt |

## Estructura del repo

```
server/     API FastAPI, WebSocket, ingestión TCP de los rastreadores, modelos y auth
frontend/   Web (React + Vite) — panel en vivo y administración
mobile/     App Flutter
alembic/    Migraciones de base de datos
tools/      Scripts de apoyo (p. ej. simulador de motos para desarrollo)
docs/       Documentación técnica (protocolo del tracker, aprovisionamiento, etc.)
deploy/     Config de despliegue
```

## Desarrollo local

Guía completa en [docs/desarrollo-local.md](docs/desarrollo-local.md). Resumen:

```bash
# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL="sqlite+aiosqlite:///./sentra.db" uvicorn server.main:app --reload --port 8000

# Frontend (otra terminal)
npm run dev --prefix frontend
```

Copia `.env.example` a `.env` y completa los valores antes de correr en Docker
(`docker-compose.yml`).

## Documentación

- [PLAN_DE_TRABAJO.md](PLAN_DE_TRABAJO.md) — plan y decisiones de arquitectura del MVP
- [PLAN_APP_MOVIL.md](PLAN_APP_MOVIL.md) — plan de la app móvil
- [docs/protocolo-st907l.md](docs/protocolo-st907l.md) — referencia del protocolo del tracker
- [docs/provisioning-st907l.md](docs/provisioning-st907l.md) — guía de aprovisionamiento para el técnico instalador
- [docs/corte-motor.md](docs/corte-motor.md) — resultado del spike de corte remoto de motor
