# Plan de Trabajo — SentraSecurity GPS (`sentra_gps`)

> **Fecha:** 1 de julio de 2026 · **Alcance:** llevar la plataforma a un MVP en producción, estable y seguro, para monitorear motos en tiempo real en Cartagena (posición en vivo, histórico, alertas, corte de motor y gestión de dispositivos/usuarios), con web y app móvil funcionales.

---

## 0. Decisiones confirmadas y supuestos

Decisiones ya tomadas contigo (no se re-discuten en este plan):

| Decisión | Elección |
|---|---|
| Núcleo de la plataforma | **Stack propio**: FastAPI + Postgres + parser propio. Traccar/MySQL se eliminan. |
| Corte remoto de motor | **Crítico para el MVP** (propuesta de valor antirrobo). |
| Modelo de negocio | **B2C**: cada cliente ve su(s) moto(s); la empresa tiene panel admin/operador. |
| Equipo y escala | **2+ personas**, objetivo 150+ motos a 6 meses. Fases frontend/backend paralelizables. |

**Supuestos** (⚠️ corrígeme si alguno es falso):

- **S1.** El servidor de producción es la VM en `158.101.105.13` (por la IP en la app móvil; parece Oracle Cloud). Hay acceso root/SSH a ella.
- **S2.** Todos los trackers son **ST-907L (SinoTrack, protocolo Totem/HQ)**; no hay que soportar otros modelos en el MVP.
- **S3.** Los trackers ya están (o pueden ser) configurados por SMS para apuntar IP/puerto del servidor propio.
- **S4.** Las motos tienen el relé de corte instalado y cableado (requisito físico del corte de motor).
- **S5.** Presupuesto de infraestructura bajo: 1 VM + dominio + certificados gratis (Let's Encrypt) + Firebase gratuito para push. Sin servicios administrados costosos.
- **S6.** El dato en el MySQL de Traccar existente **no necesita migrarse** (histórico de pruebas, no de clientes). Si esto es falso, hay que añadir una tarea de migración de datos (~2 días).
- **S7.** Hay al menos **1 tracker físico disponible para pruebas** durante todo el desarrollo (imprescindible para el spike de corte de motor).

---

## 1. Diagnóstico del estado actual

### 1.1 Lo que funciona ✅

- **Parser Totem/Sinotrack** ([server/parser.py](server/parser.py)): bien escrito. Maneja V6 (boot + ICCID) y V8 (posición periódica), convierte DDMM.MMMM → decimal, decodifica el vehicle status de 4 bytes con lógica negativa, extrae alarmas (emergencia, desplazamiento, vibración, exceso de velocidad, batería baja).
- **Servidor TCP propio** ([server/tcp_server.py](server/tcp_server.py)): acepta conexiones persistentes, re-ensambla paquetes por delimitador `#`, crea vehículos automáticamente, persiste posiciones y alarmas, actualiza el caché de "última posición" en `vehicles`.
- **WebSocket de difusión** ([server/ws.py](server/ws.py) + `GET /api/ws`): broadcast de cada posición a todos los clientes conectados.
- **API REST básica** ([server/api/routes.py](server/api/routes.py)): vehículos, posiciones con rango de fechas, track del día, alarmas con ack, stats.
- **Frontend web mínimo**: mapa Leaflet con marcadores rotados por rumbo, colores por estado (online/offline/alarma), track del día como polyline, sidebar con lista de vehículos, actualización en vivo por WS.
- **App Flutter con UI pulida**: login, shell con 4 tabs (Motos, Mapa, Alertas, Perfil), detalle de dispositivo con telemetría, mapa individual y global, **corte/restauración de motor** (vía Traccar), WS de Traccar con reconexión.
- **Modelo de datos razonable**: `vehicles` (con caché desnormalizado de última posición — buena decisión), `positions` (con índice compuesto `vehicle_id+timestamp`), `alarms`.

### 1.2 Lo que falta ❌

- **Autenticación: cero.** Ningún endpoint de FastAPI tiene auth. El WebSocket es público. CORS abierto a `*` ([server/main.py:41](server/main.py:41)). Cualquiera con la URL ve todas las motos de todos los clientes.
- **Modelo de usuarios/roles**: no existe tabla de usuarios ni relación usuario↔vehículo. Imposible el modelo B2C.
- **Comandos al dispositivo**: el `tcp_server` solo lee; no hay registro `device_id → conexión TCP`, ni cola de comandos, ni endpoint para enviarlos. El corte de motor hoy solo existe vía Traccar (y sin verificar que funcione — ver riesgo R1).
- **Geocercas, reportes, notificaciones push**: no existen en el stack propio.
- **Login web**: el frontend no tiene ni pantalla de login ni manejo de sesión.
- **Migraciones de BD**: se usa `create_all` ([server/database.py:21](server/database.py:21)); no hay Alembic. Cualquier cambio de esquema en producción será manual y riesgoso.
- **Pruebas**: cero tests propios (solo el `widget_test.dart` por defecto de Flutter). Sin CI.
- **Control de versiones**: **la carpeta no es un repositorio git.** No hay historial, ni ramas, ni respaldo del código más allá de iCloud Drive.
- **Infraestructura del stack propio**: `docker-compose.yml` solo levanta Traccar+MySQL. **No hay Postgres provisionado en ningún lado**, ni servicio para la API FastAPI (el [Dockerfile](Dockerfile) existe pero está huérfano), ni para el frontend, ni reverse proxy/HTTPS.

### 1.3 Bugs e inconsistencias detectadas 🐛

| # | Problema | Dónde | Severidad |
|---|---|---|---|
| B1 | **Doble ingestión GPS**: Traccar (puerto 5013 → MySQL) y `tcp_server` propio (puerto 8090 → Postgres) en paralelo. Dos fuentes de verdad. | `docker-compose.yml`, `server/tcp_server.py` | Crítica |
| B2 | **Clientes divididos**: la web consume FastAPI/Postgres; la app móvil consume **Traccar/MySQL directamente** en `http://158.101.105.13:8082`. Web y móvil muestran datos distintos. | [traccar_service.dart:12](mobile/lib/services/traccar_service.dart:12) | Crítica |
| B3 | `GET /api/stats` está **roto**: `db.execute(func.count(...))` no es ejecutable en SQLAlchemy 2.0 (falta `select()`), lanza `ObjectNotExecutableError` → 500. | [routes.py:122](server/api/routes.py:122) | Alta |
| B4 | `is_online` **nunca vuelve a `False`**: se marca `True` al recibir paquete, pero no hay job que lo desmarque cuando el tracker deja de reportar. Todo aparece "en línea" para siempre. | [tcp_server.py:49](server/tcp_server.py:49) | Alta |
| B5 | `_ddmm_to_decimal` se llama **fuera del try/except**: un paquete con lat/lon vacíos (típico en heartbeats o sin fix GPS) lanza `ValueError` no capturado y mata el handler de esa conexión. | [parser.py:157](server/parser.py:157) | Alta |
| B6 | **Alarmas duplicadas en cascada**: mientras el bit de alarma siga activo, cada paquete (cada pocos segundos) inserta una fila `Alarm` nueva. Sin deduplicación ni ventana de supresión → spam. | [tcp_server.py:80](server/tcp_server.py:80) | Alta |
| B7 | `asyncio.create_task(_handle_packet(...))` sin referencia ni manejo de errores: excepciones silenciosas y riesgo de garbage collection de la task (pitfall conocido de asyncio). | [tcp_server.py:139](server/tcp_server.py:139) | Media |
| B8 | Reconexión WS del frontend defectuosa: `createWebSocket` se re-crea recursivamente en `onclose`, pero el cleanup de React solo cierra el socket original → reconexiones zombis tras desmontar y sin backoff. | [api.js:18](frontend/src/api.js:18) | Media |
| B9 | Centro del mapa por defecto = **Bogotá**, el negocio está en **Cartagena** (10.39, -75.51). | [Map.jsx:53](frontend/src/pages/Map.jsx:53) | Baja |
| B10 | `Vehicle.id = String(10)` con comentario "IMEI" (el IMEI tiene 15 dígitos; el ID Totem/HQ tiene 10). Funciona, pero documentar el formato real para evitar sorpresas. | [models.py:21](server/models.py:21) | Baja |
| B11 | El `TODO: derive from ws state` deja `hasAlarm = false` fijo en la lista de vehículos: nunca se pinta el estado de alarma en el sidebar. | [VehicleList.jsx:14](frontend/src/components/VehicleList.jsx:14) | Baja |
| B12 | **La alarma de vibración se lee del bit equivocado**: el protocolo oficial (ver [docs/protocolo-st907l.md](docs/protocolo-st907l.md) §2) la ubica en byte 2 **bit 1**; el parser lee bit 0 → una vibración real nunca se detecta. Además batería baja son bits 5 **y** 6 del byte 4 (hoy solo bit 5). | [parser.py:96](server/parser.py:96) | Alta |

### 1.4 Código muerto e infraestructura huérfana 🧟

- **Todo el stack Traccar** ([traccar/traccar.xml](traccar/traccar.xml), servicios `mysql` y `traccar` del compose) queda muerto con la decisión de núcleo propio. Se elimina en la Fase 1 (después de migrar la app móvil, Fase 4, se apaga en producción).
- **[Dockerfile](Dockerfile)** del backend: correcto pero no referenciado por ningún compose.
- **`manufacturer = parts[0]`** en el parser: marcado "kept for future use" — inofensivo.
- **Pantalla Alertas de la app móvil** ([alerts_screen.dart](mobile/lib/screens/alerts_screen.dart)): placeholder estático, no consulta nada.
- **`proxy` de CRA** ([frontend/package.json:21](frontend/package.json:21)): solo sirve en desarrollo; no hay estrategia de URL de API para producción.

### 1.5 Arquitectura única recomendada

**Un solo núcleo: FastAPI + PostgreSQL + parser propio.** Traccar y MySQL se retiran. Justificación:

1. La ingestión propia ya funciona y está bien escrita; solo hay **un** modelo de tracker que soportar (S2), que es justo el caso donde Traccar aporta menos.
2. El producto diferenciador es la experiencia web/móvil propia con modelo B2C; sobre Traccar la auth unificada (JWT web+móvil), el RBAC por cliente y la UX custom serían un hack permanente contra su modelo de sesiones/permisos.
3. Operar dos sistemas (Java+MySQL además de Python+Postgres) en una VM pequeña duplica memoria, backups, monitoreo y superficie de ataque.
4. Lo que se pierde de Traccar (comandos, geocercas, reportes) está acotado y planificado en las Fases 3 y 5. El único punto genuinamente riesgoso es el **corte de motor**, que se ataca con un spike en la semana 1 (ver §6.4 y riesgo R1).

---

## 2. Decisiones de arquitectura (ADRs)

### ADR-1 · Núcleo propio, Traccar se retira
Estado: **aceptada** (decisión tuya). Consecuencia: la app móvil se reescribe contra la API propia (Fase 4); se implementan comandos, geocercas y reportes propios; Traccar queda encendido en producción **solo** hasta que la app migrada esté publicada, luego se apaga y desinstala.

### ADR-2 · Una sola base de datos: PostgreSQL 16
- Postgres (ya elegido por el backend) para **todo**: usuarios, vehículos, posiciones, eventos, geocercas, comandos.
- `positions` con **particionado nativo mensual** desde el día 1 (a 150 motos reportando cada 10 s son hasta ~1,3 M filas/día; particionar después duele).
- Retención: 6 meses de posiciones crudas (configurable); los eventos/alarmas se conservan indefinidamente.
- Migraciones con **Alembic** desde la Fase 1. `create_all` solo para tests.

### ADR-3 · Tiempo real: WebSocket propio + Postgres LISTEN/NOTIFY
- Un solo endpoint `WS /api/ws`, autenticado por JWT (primer mensaje de auth), que empuja eventos **filtrados por permisos** (un cliente B2C solo recibe sus motos; admin recibe todo).
- Ingestión y API se comunican por **Postgres LISTEN/NOTIFY** (canal `positions_new`, `commands_new`). Esto desacopla los procesos sin añadir Redis todavía y deja el camino de escala listo:
  - **MVP (hasta ~300 motos):** un contenedor `api` (uvicorn, 1 worker) + un contenedor `ingest` (TCP). LISTEN/NOTIFY entre ellos.
  - **Escala futura:** múltiples workers de API → sustituir NOTIFY por Redis pub/sub sin tocar clientes.
- El cliente manda `ping` cada 30 s; el servidor cierra conexiones sin ping en 90 s.

### ADR-4 · Autenticación unificada web + móvil: JWT
- `POST /api/auth/login` → **access token** JWT (15 min) + **refresh token** rotatorio (30 días, revocable, persistido en tabla `refresh_tokens`).
- **Web:** refresh token en cookie `httpOnly; Secure; SameSite=Lax`; access token en memoria (nunca en `localStorage`).
- **Móvil:** ambos tokens en `flutter_secure_storage`.
- **RBAC de 3 roles:** `admin` (empresa: todo), `operator` (empresa: monitoreo y ack de alertas, sin gestión de usuarios), `client` (solo sus vehículos vía tabla `user_vehicles`).
- Contraseñas con **argon2id**. Rate-limit en login (slowapi). CORS restringido al dominio.

### ADR-5 · Monorepo git
`git init` inmediato con `server/`, `frontend/`, `mobile/`, `deploy/`. `.gitignore` estricto (nunca `.env`, nunca llaves). Remoto privado en GitHub. **Nota:** la carpeta vive en iCloud Drive — mover el working copy fuera de iCloud (p. ej. `~/proyectos/`) para evitar corrupción de `.git` por sincronización, y dejar iCloud solo como copia si se quiere.

### ADR-6 · Flujo de datos objetivo

```
                          ┌────────────────────────────── VM producción ──────────────────────────────┐
                          │                                                                            │
 ST-907L ──TCP 5013──────▶│  ingest (Python asyncio)                                                   │
 (Totem *HQ...#)  ◀──cmd──│   ├─ parser.py (V6/V8)                                                     │
                          │   ├─ registro device_id → socket (para comandos)                           │
                          │   └─ escribe positions/events ──▶ PostgreSQL 16                            │
                          │                                    │  ▲                                    │
                          │                LISTEN/NOTIFY ──────┘  │ SQL                                │
                          │                      │                │                                    │
                          │                      ▼                │                                    │
                          │  api (FastAPI/uvicorn)                │                                    │
                          │   ├─ REST /api/** (JWT + RBAC) ───────┘                                    │
                          │   ├─ WS /api/ws (push filtrado por usuario)                                │
                          │   └─ workers: estado online/offline, evaluación geocercas, push FCM        │
                          │                      ▲                                                     │
                          │  Caddy (HTTPS 443) ──┤  sirve frontend estático + proxy /api               │
                          └──────────────────────┼─────────────────────────────────────────────────────┘
                                                 │
                    ┌────────────────────────────┴───────────────────────────┐
                    ▼                                                        ▼
             Web React (Vite)                                       App Flutter (dio + WS)
             mapa vivo, histórico, admin                            + push FCM
```

---

## 3. Plan por fases

Resumen (esfuerzo en **días-persona, dp**; con 2 devs varias fases corren en paralelo — ver cronograma §10):

| Fase | Nombre | Prioridad | Depende de | Esfuerzo |
|---|---|---|---|---|
| 0 | Remediación de seguridad + git + spike corte de motor | 🔴 Urgente | — | 3–4 dp |
| 1 | Backend núcleo: auth, RBAC, migraciones, fix bugs, infra única | 🔴 Alta | F0 | 8–10 dp |
| 2 | Frontend web base: Vite, login, mapa vivo, lista/detalle | 🔴 Alta | F1 (API auth) | 10–12 dp |
| 3 | Comandos (corte), histórico con reproducción, alertas usables | 🔴 Alta | F1, spike F0 | 8–10 dp |
| 4 | App móvil sobre API propia + push FCM | 🟠 Media-alta | F1, F3 | 8–10 dp |
| 5 | Geocercas, notificaciones, reportes básicos | 🟠 Media | F3 | 6–8 dp |
| 6 | Administración (dispositivos/usuarios/clientes) + hardening | 🟠 Media | F2 | 5–6 dp |
| 7 | Producción: CI/CD, backups, monitoreo, beta real | 🔴 Alta | F1–F4 | 5–6 dp |

> El orden refleja **valor × riesgo**: primero se elimina el riesgo existencial (secretos expuestos, corte de motor sin validar), luego lo que bloquea todo lo demás (auth), luego el producto visible (web), y el apagado de Traccar solo ocurre cuando la app móvil migrada está publicada.

Los checklists detallados de cada fase están en las secciones 4–9. Aquí el contenido y criterio de salida de cada una:

- **Fase 0 (§8.1, §6.4):** rotar/retirar secretos, `git init`, spike de corte de motor con tracker real. *Sale cuando:* no queda ningún secreto en el árbol de archivos y sabemos con certeza cómo se corta el motor del ST-907L (TCP, SMS o no se puede).
- **Fase 1 (§5):** usuarios+RBAC+JWT, Alembic, corrección B3–B7, `docker-compose` único (postgres+api+ingest+caddy), separación ingest/api. *Sale cuando:* la API completa corre en la VM bajo HTTPS con datos reales del tracker de pruebas y todos los endpoints exigen token.
- **Fase 2 (§4):** frontend nuevo sobre Vite con login, mapa vivo WS, lista/detalle. *Sale cuando:* un cliente B2C real puede loguearse y ver su moto moverse en vivo desde el navegador del celular.
- **Fase 3 (§5.2, §6.4):** cola de comandos + corte/restauración end-to-end con confirmación, histórico con reproducción, alertas con ack y deduplicación. *Sale cuando:* desde la web se corta y restaura el motor de la moto de pruebas y se reproduce el recorrido de ayer.
- **Fase 4 (§7):** Flutter migrada a la API propia (JWT, WS propio, comandos propios), FCM. *Sale cuando:* la app publicada (al menos en Android/APK distribuible) tiene paridad con la web para el rol cliente, y **Traccar se apaga**.
- **Fase 5 (§5.2, §4.4):** geocercas con evaluación en ingestión, eventos→push/WS, reportes (recorridos por día, km, velocidad máx). Incluye **auto-hospedar OSRM** (contenedor con extracto de Colombia) para el ajuste de rutas a vías: el frontend ya lo consume (`frontend/src/lib/mapmatch.ts`) pero apunta al demo público de OSRM, que no sirve para producción (privacidad de recorridos de clientes, límite de 10 coordenadas por petición y sin SLA) — basta cambiar la URL base y subir `CHUNK_SIZE`. 
- **Fase 6 (§4.4-admin, §8):** CRUD de clientes/usuarios/dispositivos con asignación moto↔cliente, auditoría básica, hardening final.
- **Fase 7 (§8.3–8.6):** GitHub Actions (test+build+deploy), backups automáticos con restauración probada, monitoreo/alertas de sistema, onboarding de 3–5 clientes beta.

---

## 4. Frontend web (sección principal)

### 4.1 Recomendación de stack — fundamentada

| Tema | Recomendación | Por qué |
|---|---|---|
| Build | **Migrar CRA → Vite** (con SWC) | CRA está oficialmente deprecado desde 2025, sin parches de seguridad para sus dependencias. Vite migra en horas para un proyecto de este tamaño (4 componentes), arranca en <1 s y desbloquea dependencias modernas. **Next.js no**: no hay SEO ni SSR que justifique su complejidad en un dashboard autenticado con mapa (que es 100% cliente). |
| Lenguaje | **TypeScript** | El dominio (posiciones, eventos, comandos) es propenso a errores de forma de datos; TS los atrapa en compilación. Migración gradual: los archivos nuevos en TS, los 4 existentes se portan al reescribirlos. |
| Datos servidor | **TanStack Query** | Cache, reintentos, invalidación y estados loading/error de serie para todo el REST. Elimina el patrón manual `useEffect + setInterval` actual. |
| Estado en vivo | **Zustand** (store `useLiveStore`) | El WS actualiza un solo store de posiciones/estados; los componentes se suscriben con selectores (sin re-render global como el `setVehicles` actual en `App.jsx`). Redux es sobredimensionado aquí. |
| Routing | **react-router v6** | Estándar; rutas protegidas por rol. |
| UI | **Mantine v7** | Componentes listos que este dominio necesita ya hechos: DatePicker de rangos (histórico), notificaciones toast (alertas), tablas con orden/filtro (admin, reportes), modo oscuro nativo (el look actual ya es dark). Alternativa Tailwind+shadcn es más flexible pero más lenta de construir para un equipo de 2 con deadline. |
| Mapa | **Mantener Leaflet + react-leaflet** + `react-leaflet-cluster` | Ya funciona, es gratis (OSM), el equipo lo conoce. Clustering resuelto con plugin. MapLibre GL solo si más adelante se necesitan 1000+ marcadores animados. |
| i18n | **i18next + react-i18next**, locale `es-CO` | Todo texto en `locales/es-CO.json` desde el inicio (aunque solo haya un idioma): centraliza el copy y formatea fechas/números con `Intl` es-CO. |

### 4.2 Arquitectura de carpetas

```
frontend/
├── .env.example              # VITE_API_URL=, VITE_WS_URL=  (sin valores reales)
├── index.html
├── vite.config.ts            # proxy /api → localhost:8000 en dev
└── src/
    ├── main.tsx              # providers: Router, QueryClient, Mantine, i18n
    ├── app/
    │   ├── router.tsx        # rutas + guards por rol
    │   └── layout/           # AppShell: sidebar, header, responsive drawer
    ├── api/
    │   ├── client.ts         # axios: baseURL, interceptor JWT + refresh en 401
    │   ├── auth.ts           # login/refresh/logout/me
    │   ├── vehicles.ts       # hooks useVehicles(), useVehicle(id) (TanStack)
    │   ├── positions.ts      # useHistory(id, range)
    │   ├── events.ts         # useEvents(), useAckEvent()
    │   ├── commands.ts       # useSendCommand() (corte/restauración)
    │   ├── geofences.ts
    │   └── admin.ts          # usuarios, asignaciones
    ├── realtime/
    │   ├── socket.ts         # WS: auth, reconexión con backoff exponencial + jitter,
    │   │                     #     heartbeat, cierre limpio en unmount (arregla B8)
    │   └── useLiveStore.ts   # Zustand: posiciones vivas, online/offline, eventos
    ├── auth/
    │   ├── AuthProvider.tsx  # sesión, access token en memoria, refresh silencioso
    │   └── RequireRole.tsx
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── LiveMapPage.tsx           # pantalla principal
    │   ├── VehicleDetailPage.tsx
    │   ├── HistoryPage.tsx           # reproducción de recorridos
    │   ├── EventsPage.tsx            # alertas
    │   ├── GeofencesPage.tsx
    │   ├── ReportsPage.tsx
    │   └── admin/
    │       ├── DevicesAdminPage.tsx
    │       └── UsersAdminPage.tsx
    ├── components/           # reutilizables (ver §4.5)
    ├── locales/es-CO.json
    └── styles/theme.ts       # tema Mantine: colores marca, dark por defecto
```

**Variables de entorno:** `VITE_API_URL` (vacía en prod: mismo origen tras Caddy), `VITE_WS_URL` (derivada del origen si vacía). Nada más; todo secreto vive en el servidor.

### 4.3 Auth y sesión (web)

- [ ] `AuthProvider`: al montar, intenta `POST /api/auth/refresh` (cookie httpOnly) → si ok, guarda access token en memoria y carga `GET /api/auth/me`.
- [ ] Interceptor axios: adjunta `Authorization: Bearer`; en 401 hace un único refresh y reintenta; si falla → logout y redirect a `/login` conservando `returnTo`.
- [ ] El WS se abre solo autenticado; primer mensaje `{type:"auth", token}`; si el server responde `unauthorized`, fuerza refresh y reintenta.
- [ ] Logout: `POST /api/auth/logout` (revoca refresh) + limpieza de stores.

### 4.4 Pantallas y flujos — con criterios de "hecho" (DoD)

Cada pantalla debe cumplir además los criterios transversales de §4.6.

**Login**
- [ ] Email + contraseña, mostrar/ocultar, error claro ("correo o contraseña incorrectos", sin filtrar cuál), rate-limit visible ("demasiados intentos, espera X min").
- [ ] Enter envía; foco inicial en email; funciona con gestor de contraseñas.
- **DoD:** login/logout/refresh funcionan tras recargar la página y tras expirar el access token; un usuario `client` aterriza en el mapa con solo sus motos.

**Mapa en vivo** (pantalla principal, ruta `/`)
- [ ] Marcadores con rumbo (flecha rotada) y color por estado: verde en movimiento, azul detenida con ACC on, gris offline, rojo con alerta sin reconocer.
- [ ] Clustering a partir de ~20 motos visibles (`react-leaflet-cluster`).
- [ ] Sidebar/lista con búsqueda por nombre/placa, orden por estado, contador online/offline; en móvil se convierte en bottom-sheet.
- [ ] Seleccionar moto → flyTo + popup con telemetría (velocidad, batería, voltaje, GSM, satélites, ACC, "visto hace X" con `timeago` es-CO) + botones "Ver detalle", "Histórico", "Cortar motor" (según rol y con confirmación).
- [ ] Modo **seguimiento**: fija el mapa a una moto; se desactiva al arrastrar el mapa manualmente.
- [ ] Transición suave del marcador entre posiciones (interpolación ~1 s), no saltos.
- [ ] Badge de estado de conexión WS (conectado / reconectando) siempre visible.
- [ ] Centro por defecto: **Cartagena** `[10.391, -75.4794]` (corrige B9).
- **DoD:** con el tracker de pruebas en movimiento, la posición se actualiza sin recargar en <3 s desde el paquete; matar la red y recuperarla reconecta el WS solo y re-sincroniza (refetch de últimas posiciones al reconectar).

**Lista y detalle de vehículo** (`/vehicles`, `/vehicles/:id`)
- [ ] Lista: tabla/cards responsive con estado, placa, última posición (dirección geocodificada inversa si disponible), batería, acciones.
- [ ] Detalle: telemetría completa, mini-mapa, últimos eventos, accesos a histórico y comandos, edición de nombre/placa (roles empresa).
- **DoD:** un `client` no puede abrir por URL el detalle de una moto ajena (404/403 verificado).

**Histórico de recorridos** (`/vehicles/:id/history`)
- [ ] Selector de rango (hoy / ayer / últimos 7 días / rango custom con DatePicker es-CO).
- [ ] Polyline coloreada por velocidad; marcadores de inicio/fin; puntos de parada (>5 min sin movimiento) con duración.
- [ ] **Reproducción**: play/pausa, velocidad 1×/4×/16×, scrubber; el marcador recorre la ruta y un panel muestra hora/velocidad del punto actual.
- [ ] Resumen del rango: distancia total, tiempo en movimiento, velocidad máx/promedio.
- [ ] Si el rango excede N puntos, el backend entrega la ruta simplificada (Douglas-Peucker) y la UI lo indica.
- **DoD:** cargar 24 h de un tracker real (~8 000 puntos) renderiza y reproduce fluido en un móvil de gama media; rango sin datos muestra estado vacío con CTA de cambiar fechas.

**Alertas / eventos** (`/events`)
- [ ] Lista en tiempo real con filtros (tipo, moto, estado ack, rango); toast + sonido opcional al llegar evento crítico (EMERGENCY, corte de energía, geocerca).
- [ ] Reconocer individual y en lote; el evento enlaza a la posición en el mapa.
- [ ] Badge con conteo de no-reconocidas en el nav.
- **DoD:** provocar una alarma real (botón SOS del tracker) la muestra en <5 s con toast, y el ack la quita del contador en todos los clientes conectados.

**Geocercas** (`/geofences`, Fase 5)
- [ ] Dibujo en mapa (círculo y polígono, `leaflet-draw`), nombre, color, asignación a motos, activar/desactivar entrada/salida.
- [ ] CRUD completo y listado con mini-preview.
- **DoD:** sacar el tracker de prueba de una geocerca genera evento + push en <30 s.

**Reportes** (`/reports`, Fase 5)
- [ ] Por moto y rango: km recorridos, horas en movimiento, velocidad máxima, paradas, eventos. Export CSV.
- **DoD:** el total de km de un día coincide ±5 % con el odómetro calculado en la reproducción de histórico.

**Administración** (`/admin/*`, solo `admin`/`operator`, Fase 6)
- [ ] Dispositivos: alta (ID Totem de 10 dígitos, ICCID, notas de instalación), edición, baja lógica, estado de conexión, último paquete crudo (debug).
- [ ] Usuarios/clientes: alta de cliente con email+teléfono, asignación de motos (user_vehicles), reset de contraseña, desactivación; roles.
- **DoD:** flujo completo de onboarding: crear cliente → crear dispositivo → asignar → el cliente hace login y ve su moto, sin tocar la BD a mano.

### 4.5 Componentes reutilizables

`VehicleMarker` (icono rumbo+estado), `VehicleStatusBadge`, `TelemetryGrid`, `BatteryIndicator`, `SignalIndicator`, `EventBadge`/`EventListItem`, `MapShell` (TileLayer+attribution+controles comunes), `TrackPolyline` (color por velocidad), `PlaybackControls`, `DateRangePicker` (presets es-CO), `ConfirmDangerModal` (corte de motor: escribe la placa para confirmar), `EmptyState`, `ErrorState` (con retry), `PageSkeleton`, `ConnectionBadge` (estado WS).

### 4.6 Criterios transversales (aplican a toda pantalla)

- [ ] **Responsive mobile-first**: breakpoint base 360 px; el mapa vivo usable en el navegador del celular (los clientes B2C entrarán más por ahí que por desktop). Sidebar → drawer/bottom-sheet en <768 px.
- [ ] **Estados**: loading (skeletons, no spinners globales), vacío (mensaje + acción), error (mensaje humano + botón reintentar + detalle técnico colapsado). Nunca pantalla en blanco.
- [ ] **Accesibilidad**: navegable por teclado, focus visible, `aria-label` en botones de icono, contraste AA sobre el tema oscuro, textos de estado no solo por color (icono/texto además del color del marcador).
- [ ] **i18n es-CO**: todo copy vía i18next; fechas `dd/MM/yyyy hh:mm a`, números con coma decimal, "hace 5 min" con timeago es.
- [ ] **Tiempo real**: toda vista que muestre posición/estado se suscribe al `useLiveStore`; al reconectar el WS, refetch de sincronización.

### 4.7 Guía de estilo / UX

- **Tema oscuro por defecto** (continuidad con la UI actual): fondo `#0f172a`, acento azul `#38bdf8`, semánticos verde `#22c55e` / rojo `#ef4444` / ámbar `#eab308` / gris `#94a3b8` — los mismos que ya usa el mapa, formalizados en `theme.ts`. Modo claro opcional post-MVP.
- **Jerarquía**: el mapa es el protagonista; paneles flotantes translúcidos encima, no layouts que lo encojan.
- **Lenguaje**: español colombiano, directo, sin tecnicismos ("Sin señal desde hace 2 h", no "device offline"). Acciones peligrosas siempre con confirmación explícita y consecuencia descrita ("La moto no encenderá hasta que restaures el motor").
- **Latencia percibida**: optimistic UI en acks y ediciones; los comandos al dispositivo muestran estados reales (`enviado → entregado → confirmado`), nunca éxito optimista (ver §5.2).

---

## 5. Backend / API

### 5.1 Modelo de datos objetivo (Postgres)

```
users(id, email UNIQUE, password_hash, full_name, phone, role[admin|operator|client],
      is_active, created_at)
refresh_tokens(id, user_id FK, token_hash, expires_at, revoked_at, user_agent)
vehicles(id TEXT PK ← ID Totem 10 dígitos, name, plate, iccid, owner_notes,
         is_active, + caché última posición como hoy, created_at, updated_at)
user_vehicles(user_id FK, vehicle_id FK, PK compuesto)        -- B2C: asignación
positions(id BIGSERIAL, vehicle_id FK, timestamp, lat, lon, speed_kmh, direction,
          valid, satellites, gsm_signal, voltage, battery_pct, acc_off)
          PARTITION BY RANGE (timestamp)                       -- mensual
events(id, vehicle_id FK, type[EMERGENCY|OVERSPEED|LOW_BATTERY|VIBRATION|DISPLACEMENT|
       GEOFENCE_ENTER|GEOFENCE_EXIT|POWER_CUT|OFFLINE|ONLINE|ENGINE_CUT|ENGINE_RESTORE],
       timestamp, lat, lon, payload JSONB, acknowledged_by FK NULL, acknowledged_at)
geofences(id, name, geometry GEOJSON/JSONB, color, is_active, created_by)
geofence_vehicles(geofence_id, vehicle_id, notify_enter BOOL, notify_exit BOOL)
device_commands(id, vehicle_id FK, type[ENGINE_STOP|ENGINE_RESUME|LOCATE|REBOOT],
                status[pending|sent|delivered|confirmed|failed|expired],
                requested_by FK, payload, created_at, sent_at, confirmed_at, error)
push_tokens(id, user_id FK, fcm_token, platform, updated_at)
```

Renombrar `alarms` → `events` (unifica alarmas del tracker con eventos del sistema: geocercas, online/offline, comandos). Migración Alembic inicial parte del esquema actual.

### 5.2 Endpoints REST (prefijo `/api`)

| Grupo | Endpoints | Notas |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me/password` | Rate-limit 5/min/IP en login |
| Vehículos | `GET /vehicles`, `GET /vehicles/{id}`, `POST /vehicles` (admin), `PATCH /vehicles/{id}`, `DELETE /vehicles/{id}` (baja lógica, admin) | `GET` filtra por rol: client → solo asignados |
| Posiciones | `GET /vehicles/{id}/positions?from&to&simplified=`, `GET /vehicles/{id}/track/today` | `simplified` aplica Douglas-Peucker server-side; paginación por cursor |
| Eventos | `GET /events?…filtros`, `PATCH /events/{id}/ack`, `POST /events/ack-batch` | |
| Comandos | `POST /vehicles/{id}/commands` (body `{type}`), `GET /vehicles/{id}/commands` | Corte: solo `admin`/`operator` **o** `client` dueño con re-confirmación; auditado siempre |
| Geocercas | CRUD `/geofences`, `POST /geofences/{id}/vehicles` | Fase 5 |
| Reportes | `GET /reports/vehicles/{id}/summary?from&to`, `GET …/export.csv` | Fase 5 |
| Admin | CRUD `/admin/users`, `POST /admin/users/{id}/vehicles`, `GET /admin/devices/{id}/raw-log` | Fase 6 |
| Sistema | `GET /stats` (corregido, por rol), `GET /healthz` (sin auth, para monitoreo) | |

**Ciclo de vida de un comando de corte** (nada de éxito optimista):
`pending` (creado por API, NOTIFY `commands_new`) → `sent` (ingest lo escribió al socket del dispositivo; si no está conectado queda `pending` y se envía en cuanto llegue su próximo paquete) → `confirmed` (el tracker responde/el siguiente paquete refleja el estado) → o `failed`/`expired` (TTL 10 min). La API expone el estado y el WS lo empuja al cliente que lo pidió.

### 5.3 WebSocket

- `WS /api/ws` → primer mensaje `{type:"auth", token}`; sin auth válida en 5 s se cierra.
- Server → cliente: `{type:"position"|...}` para `position`, `event`, `vehicle_status` (online/offline), `command_status` — **solo de vehículos visibles para ese usuario**.
- Manager indexado por `user_id` con set de `vehicle_ids` permitidos (recalculado al cambiar asignaciones).
- Fuente de eventos: LISTEN en canales Postgres (`positions_new`, `events_new`, `commands_update`) publicados por `ingest`.

### 5.4 Tareas de backend (checklist Fase 1 + 3)

- [ ] Alembic inicializado; migración 001 = esquema actual, 002 = usuarios/RBAC/eventos/comandos.
- [ ] Módulo `auth/` (argon2id, JWT RS256 o HS256 con secreto fuerte, refresh rotatorio + revocación).
- [ ] Dependencias FastAPI `require_role(...)` y filtro por `user_vehicles` en todas las queries.
- [ ] Corregir B3 (`/stats`), B4 (job `mark_offline` cada 60 s: `is_online=False` si `last_seen > 5 min` + evento `OFFLINE`/`ONLINE`), B6 (dedupe: no crear evento si existe uno igual sin ack en los últimos 10 min), B7 (task con referencia + `add_done_callback` que loguee excepciones).
- [ ] Particionado mensual de `positions` + job de retención.
- [ ] Separar `ingest` en proceso/contenedor propio; comunicación por LISTEN/NOTIFY.
- [ ] Rate limiting (slowapi), CORS restringido, headers de seguridad, logging estructurado (JSON) con request-id.
- [ ] Rendimiento: pool asyncpg dimensionado; batch-insert de posiciones si un dispositivo envía ráfagas; índice BRIN en `positions.timestamp` de particiones antiguas.

**Escalabilidad (documentada, no construida aún):** 150 motos ≈ 15 paquetes/s pico — trivial para 1 VM. El primer cuello real será el fan-out WS con muchos usuarios simultáneos: la salida es Redis pub/sub + múltiples workers uvicorn detrás de Caddy, sin cambios de contrato para los clientes.

---

## 6. Ingestión GPS (ST-907L / Totem)

### 6.1 Endurecer el parser
- [ ] Capturar `ValueError` en conversión de coordenadas (B5); paquete con lat/lon vacías → procesar como "sin fix" (actualiza `last_seen`, no posición).
- [ ] Soportar paquetes cortos tipo heartbeat/V1 (hoy se descartan por `len(parts) < 17` → un tracker en reposo puede parecer muerto estando conectado).
- [ ] Guardar el paquete crudo (ring buffer por dispositivo o log rotado) para depurar en campo.
- [ ] Suite de "paquetes dorados": archivo con tramas reales capturadas del ST-907L (válidas, inválidas, alarmas, boot V6, heartbeat) como fixtures de tests.

### 6.2 Servidor TCP
- [ ] **Registro de conexiones**: `dict[device_id → StreamWriter]` actualizado al identificar el primer paquete; base para comandos.
- [ ] Revisar si el ST-907L espera ACK del servidor (algunos firmware HQ reconectan en bucle sin respuesta); verificar con el tracker real y añadir ACK si aplica.
- [ ] Timeout de lectura ≠ estado online: la conexión puede cerrarse y el vehículo seguir "reciente"; el estado online lo decide el job de §5.4 sobre `last_seen`.
- [ ] Límite de tamaño de buffer por conexión (descarta clientes basura que nunca envían `#`).
- [ ] Métricas: paquetes/s, paquetes inválidos, conexiones activas (exponer en `/healthz` interno del ingest).

### 6.3 Reconexión / keep-alive
- El tracker reconecta solo (comportamiento del firmware); del lado servidor: aceptar reconexión reemplazando el writer registrado, tolerar conexiones duplicadas del mismo ID (cerrar la vieja).

### 6.4 Comandos hacia el dispositivo — **spike semana 1** 🔬

**Actualización (2026-07-03):** la documentación oficial del ST-907/907L ya fue analizada
(ver [docs/protocolo-st907l.md](docs/protocolo-st907l.md)). El corte de motor está documentado
como **comando SMS**: `940+password` corta, `941+password` restaura, y el equipo responde
`SET OK`. El protocolo TCP **no define ningún comando servidor→dispositivo**, así que el
canal SMS pasa de "plan B" a **plan A**, y el `engineStop` vía Traccar casi con certeza
nunca funcionó para este equipo.

El spike con la moto/tracker de pruebas queda así:

- [ ] Verificar que SMS `940`/`941` acciona el relé tal como está cableado, y medir latencia SMS→corte con operador local.
- [ ] Probar si el firmware también acepta el comando por el socket TCP (no documentado; si funcionara, ahorraría SMS por comando).
- [ ] Elegir el **gateway SMS**: módem GSM USB en la VM con SIM local (ciclo cerrado: envía y recibe el `SET OK` de confirmación — candidata preferida) vs. API de operador/agregador. Medir costo por comando.
- [ ] Capturar tramas V6/V8 reales (incluida una vibración y un SOS) como fixtures para los tests del parser.
- [ ] Cambiar la contraseña por defecto `0000` del equipo de pruebas y documentar la secuencia completa de aprovisionamiento (base ya escrita en `docs/protocolo-st907l.md` §3).
- **Salida del spike:** `docs/corte-motor.md` con latencia medida, gateway elegido y el flujo `device_commands` ajustado (estado `confirmed` = SMS `SET OK` recibido). Si el relé no responde, se re-negocia el alcance del MVP contigo (el resto del plan no cambia).

### 6.5 Configuración de los trackers
- [ ] Documentar en `docs/provisioning-st907l.md` los SMS de aprovisionamiento (APN del operador local, IP/puerto del servidor propio, intervalo de reporte 10–30 s en movimiento).
- [ ] Checklist de instalación física por moto (relé, alimentación, SOS) para el técnico.

---

## 7. App móvil (Flutter) — Fase 4

Reescritura de la **capa de datos** (la UI actual se conserva casi toda):

- [ ] `TraccarService` → `SentraApi` (dio): JWT + refresh en interceptor, tokens en `flutter_secure_storage` (reemplaza cookies/cookie_jar, se eliminan `cookie_setup*.dart`).
- [ ] Modelos `Device`/`Position` → adaptados al contrato de la API propia (ids de vehículo tipo string, campos del `_vehicle_dict`).
- [ ] WS propio (`web_socket_channel` ya presente): mismo protocolo de auth del §5.3, reconexión con backoff + resync (hoy reconecta cada 5 s fijo y sin resincronizar).
- [ ] Config del host por `--dart-define=API_URL=` (elimina la IP hardcodeada y el default inseguro).
- [ ] **Eliminar credenciales hardcodeadas del login** (parte de Fase 0, ver §8.1).
- [ ] Mantener `provider` como state management (ya en uso; migrar a Riverpod no aporta al MVP).

**Pantallas** (paridad con web para rol `client`):
- [ ] Login (ya existe) + "recordar sesión" con refresh token + logout en Perfil.
- [ ] Motos (home): estados online/movimiento/alerta reales, pull-to-refresh.
- [ ] Mapa (individual y global): `flutter_map` se mantiene; seguimiento en vivo; centro Cartagena.
- [ ] Detalle: telemetría + **corte/restauración** contra `/vehicles/{id}/commands` con estados reales del comando y doble confirmación.
- [ ] **Alertas: reemplazar el placeholder** por lista real (`GET /events`) con ack y actualización por WS.
- [ ] **Histórico** (nueva): rango + polyline (paridad con web; la reproducción animada puede ser post-MVP en móvil).
- [ ] **Push FCM**: `firebase_messaging` + registro de token en `POST /push_tokens`; el backend envía push en eventos críticos (emergencia, geocerca, corte de energía, offline prolongado) vía FCM HTTP v1; `flutter_local_notifications` (ya presente) para foreground.
- [ ] Distribución: Android primero (APK/Play interno); iOS después del MVP (requiere cuenta Apple y revisión).

---

## 8. Seguridad y DevOps

### 8.1 🚨 Remediación inmediata (Fase 0 — antes que cualquier otra cosa)

Expuesto hoy en el árbol de archivos (y sincronizado a iCloud):

1. **Llave privada RSA sin cifrar** [ssh-key-2026-05-19.key](ssh-key-2026-05-19.key) — presumiblemente da acceso SSH a la VM de producción.
2. **Contraseñas de BD** en [docker-compose.yml](docker-compose.yml) (`root_sentra2025`, `traccar_sentra`) y [traccar/traccar.xml](traccar/traccar.xml).
3. **Email + contraseña personales hardcodeados** en [login_screen.dart:14](mobile/lib/screens/login_screen.dart:14) — y esa contraseña parece de uso personal: si la reutilizas en otros servicios, cámbiala en todos.
4. **IP pública + HTTP sin TLS** en [traccar_service.dart:12](mobile/lib/services/traccar_service.dart:12): las credenciales viajan en texto plano por la red.

Checklist (orden exacto):
- [ ] Generar **nueva** llave SSH (`ed25519`, con passphrase), instalarla en la VM, verificar acceso, **revocar la vieja** (quitar de `authorized_keys` y de la consola del cloud) y borrar `ssh-key-2026-05-19.key` del proyecto. Las llaves viven en `~/.ssh/`, jamás en un repo.
- [ ] Cambiar la contraseña de la cuenta Traccar (y en cualquier otro servicio donde se reuse `Qwerty291209*`). Quitar los valores por defecto de los `TextEditingController`.
- [ ] Rotar contraseñas de MySQL (mientras Traccar siga vivo) y moverlas a `.env` + `env_file` en compose.
- [ ] Crear `.env.example` (claves sin valores) y `.gitignore` raíz que excluya `.env`, `*.key`, `*.pem`, `.idea/`, `node_modules/`, `build/`.
- [ ] **`git init` + primer commit SOLO después** de limpiar lo anterior (así los secretos nunca entran al historial y no hará falta reescribirlo). Remoto privado en GitHub.
- [ ] Instalar `gitleaks` como pre-commit hook para que no vuelva a entrar un secreto.
- [ ] Mover el working copy fuera de iCloud Drive (ADR-5).

### 8.2 HTTPS y reverse proxy
- [ ] **Caddy** en la VM (TLS automático con Let's Encrypt, config de 10 líneas): `https://app.sentra…` sirve el build del frontend y proxya `/api` (incluido WS) al contenedor `api`. Puerto 5013/TCP directo al contenedor `ingest` (el protocolo del tracker no usa TLS).
- [ ] Firewall de la VM: solo 80/443/5013 públicos + SSH restringido por IP si es posible; Postgres jamás expuesto.

### 8.3 CI/CD (GitHub Actions)
- [ ] `ci.yml`: lint (ruff, eslint, flutter analyze) + tests (pytest, vitest, flutter test) en cada PR.
- [ ] `deploy.yml`: en push a `main` → build de imágenes (api, ingest, frontend) → push a GHCR → SSH a la VM → `docker compose pull && up -d` → smoke test contra `/healthz`.
- [ ] Secretos solo en GitHub Secrets (llave de deploy dedicada, distinta a la personal).

### 8.4 Backups
- [ ] `pg_dump` diario (cron en la VM) + copia **fuera de la VM** (Object Storage del cloud o rclone a otro proveedor), retención 30 días.
- [ ] **Prueba de restauración** documentada y ejecutada al menos una vez antes del go-live (un backup no probado no es backup).

### 8.5 Monitoreo y logs
- [ ] `GET /healthz` (api) + healthcheck del ingest; **Uptime Kuma** (o healthchecks.io) avisando a tu Telegram/correo si algo cae — incluye chequeo de "¿hace cuánto llegó el último paquete GPS global?" (detecta caída del ingest aunque el proceso viva).
- [ ] **Sentry** (plan gratuito) en api, frontend y Flutter para excepciones.
- [ ] Logs de contenedores con rotación (`max-size`); logs de acceso en Caddy.

### 8.6 Compose objetivo (reemplaza al actual)
```yaml
services:
  postgres:   # 16-alpine, volumen, healthcheck, credenciales desde .env
  api:        # imagen GHCR, depends_on postgres, expone 8000 interno
  ingest:     # misma imagen, comando distinto, puerto 5013:5013
  caddy:      # 80/443, sirve frontend + proxy /api y /api/ws
  # traccar + mysql permanecen SOLO hasta el corte de la app móvil (Fase 4), luego se eliminan
```

---

## 9. Pruebas

### 9.1 Unitarias
- **Parser** (la joya): tests con paquetes dorados reales — V6, V8 válidos/ inválidos, alarmas por bit, coordenadas S/W, lat vacía, basura no-Totem, paquetes concatenados y partidos en dos lecturas TCP. Objetivo: 100 % de ramas del parser.
- **Auth**: hash, expiración, refresh rotatorio, revocación, RBAC por rol.
- **Frontend**: lógica de stores (útlima posición gana, orden por estado), formateadores es-CO. Vitest + Testing Library.

### 9.2 Integración (pytest + testcontainers-postgres)
- TCP end-to-end: abrir socket → enviar trama real → aseverar fila en `positions`, caché en `vehicles`, NOTIFY emitido.
- Comandos: `POST /commands` → estado `pending` → simulador de tracker conecta → `sent` → respuesta simulada → `confirmed`.
- Reglas RBAC: cliente A no ve/no comanda motos de cliente B (tests de autorización por endpoint).
- **Simulador de tracker** (`tools/simulator.py`): script que reproduce tramas reales con timing configurable — sirve para tests, para demos y para desarrollo sin hardware.

### 9.3 E2E
- **Playwright** (web): login → mapa vivo recibe posición del simulador → histórico → ack de alerta → flujo admin de onboarding. Corre en CI contra compose efímero.
- **Flutter**: `integration_test` para login + home + detalle (con API mockeada); smoke manual en dispositivo real por release.

### 9.4 Criterios de aceptación por fase
Cada fase cierra solo si: (a) su checklist está completo, (b) los tests de las fases anteriores siguen verdes en CI, y (c) su criterio de salida (§3) se demuestra **con el tracker real**, no solo con el simulador. La Fase 7 exige además: restauración de backup probada, y 72 h de operación continua sin intervención con ≥1 tracker reportando.

---

## 10. Riesgos y cronograma

### 10.1 Riesgos principales

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | ~~El corte de motor falla en la práctica~~ **Resuelto (2026-07-05)**: `940`/`941` probados con hardware real (banco de pruebas) — clic del relé y `SET OK` confirmados en ambos sentidos. Ver [docs/corte-motor.md](docs/corte-motor.md). Riesgo residual bajo: falta validar el corte de arranque ya instalado en la moto, y falta elegir/montar el gateway SMS automatizado | Baja | Medio | Instalar en moto y repetir la prueba de arranque real; decidir gateway (módem GSM local vs. API operador) antes de automatizar el envío |
| R2 | Secretos ya expuestos fueron comprometidos (llave SSH, contraseña personal) | Media | Crítico | Rotación inmediata (Fase 0) + revisar accesos/logs de la VM y actividad de la cuenta de correo |
| R3 | Firmware del ST-907L con variaciones de protocolo (tramas no contempladas) | Media | Medio | Log de tramas crudas + parser tolerante + fixtures de tramas reales |
| R4 | Migración de la app móvil se atrasa y obliga a mantener Traccar vivo más tiempo | Media | Medio | Traccar sigue operativo hasta el corte (híbrido acotado); la API propia se diseña sin depender de su apagado |
| R5 | Volumen de `positions` degrada consultas de histórico | Baja | Medio | Particionado desde el día 1, simplificación server-side, retención |
| R6 | Equipo de 2 con scope amplio: geocercas/reportes comen el tiempo del núcleo | Alta | Medio | Fases 5–6 son recortables; el MVP mínimo vendible es F0–F4 + F7 |
| R7 | Costos/SIM: plan de datos de cada tracker, SMS de comandos | Baja | Bajo | Medir consumo real en el spike; APN local negociado |

### 10.2 Cronograma (2 devs: A = backend/infra, B = frontend/móvil)

| Semana | Dev A (backend/infra) | Dev B (frontend/móvil) | Hito |
|---|---|---|---|
| 1 | **F0**: rotación de secretos, git, spike corte motor | F0 apoyo + setup Vite/TS/Mantine, tema, layout | 🔒 Repo limpio y en git; veredicto del corte |
| 2 | **F1**: Alembic, users/JWT/RBAC, fix B3–B7 | **F2**: login, AuthProvider, API client | |
| 3 | F1: split ingest/api, LISTEN/NOTIFY, compose nuevo, Caddy/HTTPS en VM | F2: mapa vivo + WS store + lista/detalle | 🌐 API v1 en producción con HTTPS |
| 4 | **F3**: cola `device_commands` + corte end-to-end; dedupe eventos; job online/offline | F2 cierre + **F3**: histórico con reproducción | 🖥️ Web usable por un cliente beta |
| 5 | F3: eventos por WS, endpoints reportes básicos | F3: pantalla alertas + UI comandos con estados | ⚡ Corte de motor desde la web |
| 6 | **F4** soporte: push FCM server-side; **F5**: geocercas en ingest | **F4**: migración Flutter a API propia | |
| 7 | F5: eventos geocerca + notificaciones | F4: app con paridad + FCM; APK beta | 📱 App migrada → **se apaga Traccar** |
| 8 | **F7**: CI/CD completo, backups + restore probado | **F6**: admin usuarios/dispositivos | |
| 9 | F7: monitoreo (Kuma, Sentry), hardening final | F5/F6 cierre: reportes UI, pulido responsive/a11y | |
| 10 | **Beta**: onboarding 3–5 clientes reales, correcciones | Beta: correcciones, docs de usuario | 🚀 **MVP en producción** |

**Dependencias críticas del cronograma:** el spike R1 (semana 1) condiciona la Fase 3; la API auth (semana 2) bloquea el frontend de la semana 3; la migración móvil (semana 6–7) es prerequisito para apagar Traccar; el hardware de pruebas (S7) es prerequisito de casi todo.

---

## Preguntas abiertas (no bloquean el arranque, sí las fases marcadas)

1. ¿Hay datos de clientes reales en el MySQL de Traccar que haya que migrar? (afecta S6, Fase 4)
2. ¿Nombre de dominio ya comprado? Se necesita en semana 3 para HTTPS (Fase 1/7).
3. ¿Los SIM de los trackers pueden recibir SMS y de qué operador son? (plan B del corte, Fase 3)
4. ¿iOS es requisito del MVP o basta Android? (afecta Fase 4 y costos de cuenta Apple)
5. ¿La cuenta/VM cloud está a nombre de la empresa y con MFA activado? (Fase 0)
