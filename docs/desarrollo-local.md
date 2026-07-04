# Cómo correr SentraSecurity en local (macOS)

Ruta del proyecto (ojo con los espacios y el `~`, por eso van comillas):

```
/Users/manuelesteban/Library/Mobile Documents/com~apple~CloudDocs/proyectos/SentraSecurity
```

Abrir una terminal ahí: en Finder, clic derecho sobre la carpeta →
**Servicios → Nueva terminal en la carpeta**. O abre Terminal y pega el `cd` de abajo.

---

## 1. Preparación (una sola vez)

```bash
cd "/Users/manuelesteban/Library/Mobile Documents/com~apple~CloudDocs/proyectos/SentraSecurity"

# Entorno de Python del backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend (las dependencias ya están instaladas; solo si hiciera falta):
# npm install --prefix frontend

# Crear un usuario administrador para entrar (usa la MISMA BD que el servidor)
DATABASE_URL="sqlite+aiosqlite:///./sentra.db" \
  python -m server.create_admin admin@sentra.local Admin12345 --role admin --name "Admin"
```

> Para desarrollo se usa **SQLite** (un archivo `sentra.db`), no hace falta Postgres.
> Sin `DATABASE_URL` el backend intenta conectarse a Postgres y falla.

---

## 2. Arrancar (cada vez) — 3 terminales

**Terminal 1 · Backend** (API + WebSocket + ingestión TCP)

```bash
cd "/Users/manuelesteban/Library/Mobile Documents/com~apple~CloudDocs/proyectos/SentraSecurity"
source .venv/bin/activate
DATABASE_URL="sqlite+aiosqlite:///./sentra.db" uvicorn server.main:app --reload --port 8000
```

**Terminal 2 · Frontend** (web)

```bash
cd "/Users/manuelesteban/Library/Mobile Documents/com~apple~CloudDocs/proyectos/SentraSecurity/frontend"
npm run dev
```

Abre 👉 **http://localhost:3000** e ingresa con `admin@sentra.local` / `Admin12345`.

**Terminal 3 · Simulador de motos** (opcional, para ver datos moviéndose)

```bash
cd "/Users/manuelesteban/Library/Mobile Documents/com~apple~CloudDocs/proyectos/SentraSecurity"
source .venv/bin/activate
python tools/simulator.py
```

Genera 3 motos: una recorriendo Bocagrande↔Centro por las calles, una detenida
con alarma de vibración y una sin señal. Sin trackers reales apuntando a tu
equipo, esta es la forma de ver el mapa con movimiento. Se detiene con `Ctrl+C`.

---

## Notas

- **Detener todo:** `Ctrl+C` en cada terminal.
- **Empezar con datos limpios:** borra el archivo `sentra.db` (`rm sentra.db`) y
  vuelve a crear el usuario admin.
- El **ajuste de rutas a vías** usa el OSRM del VPS (`frontend/.env`); funciona
  mientras el VPS y el puerto 5000 sigan arriba.
- Puertos: 3000 (web), 8000 (API/WS), 8090 (ingestión TCP de los trackers).
- Producción es distinto: Postgres + Docker (`docker-compose.yml`) + Caddy/HTTPS,
  pendiente de desplegar (Fase 1/7 del plan).
```
