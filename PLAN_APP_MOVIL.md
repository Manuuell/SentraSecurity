# Plan de Trabajo — App Móvil Flutter (SentraSecurity)

> **Fecha:** 3 de julio de 2026 · Expande la **Fase 4** del [PLAN_DE_TRABAJO.md](PLAN_DE_TRABAJO.md).
> **Objetivo:** migrar la app Flutter de la API de Traccar a la **API propia** (FastAPI + JWT), con paridad funcional con la web para el rol `client` (B2C), corte de motor con estados reales, alertas en vivo y push FCM. Al publicarse la app migrada, **se apaga Traccar** (hito del plan maestro, semana 7).

---

## 0. Decisiones heredadas y supuestos

Ya decidido (plan maestro — no se rediscute):

| Decisión | Implicación para la app |
|---|---|
| Núcleo propio, Traccar se elimina | Se reescribe la capa de datos completa (`traccar_service.dart` desaparece) |
| Auth JWT unificada web+móvil | Access 15 min en memoria + refresh rotatorio en almacenamiento seguro |
| B2C | La app es la cara del cliente final: solo ve **sus** motos |
| Corte de motor crítico | Botón de corte/restauración en la app con estados reales (`pending→sent→confirmed`) |
| Diseño | **Blanco minimalista**, mismo sistema de diseño que la web nueva |

**Supuestos** (⚠️ corrígeme si alguno falla):

- **S1. Android primero.** iOS post-MVP (pregunta abierta #4 del plan maestro sigue sin respuesta; requiere cuenta Apple US$99/año y revisión). El código se escribe multiplataforma igual.
- **S2.** Hay cuenta de Google/Firebase disponible (plan gratuito Spark alcanza para FCM).
- **S3.** `minSdkVersion` Android ≥ 23 (requisito de `flutter_secure_storage`; el default actual de Flutter ya lo cumple).
- **S4.** La app **no usa la ubicación del teléfono** — solo muestra la del tracker. Esto simplifica permisos y la revisión de Play Store (no aplica la política de ubicación en segundo plano).
- **S5.** Para la beta, los trackers ya reportan al backend propio (Fase 1 del plan maestro desplegada con HTTPS).

---

## 1. Estado actual de la app (diagnóstico)

**Se conserva** (ya está bien):
- Estructura de pantallas y navegación: `main_shell.dart` con 4 tabs (Motos, Mapa, Alertas, Perfil) + push a detalle/mapa individual.
- `flutter_map` + `latlong2` (OSM sin API key), `provider` como state management, `flutter_local_notifications`, `timeago`/`intl`.
- La calidad visual general de las pantallas (cards redondeadas, jerarquía clara) — se re-tematiza, no se rehace.

**Se reemplaza**:
- `services/traccar_service.dart` → capa de datos propia (`core/` + `data/`), incluida la sesión por cookies → JWT.
- `models/device.dart` y `models/position.dart` → modelos del contrato propio (ids de vehículo `String`, campos de `/api/vehicles`).
- Protocolo WS de Traccar (`{positions:[], devices:[]}`) → protocolo propio (`{type:"position"|...}`).
- Tema actual (azul `#4A90D9` + verde `#58CC02`) → tokens del sistema de diseño web.

**Se elimina**:
- `cookie_jar`, `dio_cookie_manager`, `http` (queda solo `dio`) y los 3 archivos `cookie_setup*.dart`.
- 🚨 **Credenciales hardcodeadas** en `login_screen.dart:14-15` y la **IP hardcodeada** `http://158.101.105.13:8082` en `traccar_service.dart:12` (parte de la Fase 0 global de seguridad — ver §8, fase M0: esto se hace YA, sin esperar al resto).

**No existe todavía** (se construye):
- Alertas reales (la pantalla actual es un placeholder estático), histórico de recorridos, push FCM, splash/bootstrap de sesión, manejo de estados vacío/error/reconexión.

---

## 2. Arquitectura objetivo

### 2.1 Capas y estructura de carpetas

```
mobile/lib/
├── main.dart                  # bootstrap: config, providers, tema, splash
├── core/
│   ├── config.dart            # API_URL/WS_URL por --dart-define (sin defaults inseguros)
│   ├── api_client.dart        # dio: baseURL, interceptor JWT + refresh con cola
│   ├── token_storage.dart     # flutter_secure_storage (access + refresh)
│   └── ws_client.dart         # WS: auth por primer mensaje, backoff+jitter,
│                              #     heartbeat 30 s, pausa en background, resync
├── data/
│   ├── models/                # vehicle.dart, event.dart, track_point.dart,
│   │                          # command.dart, user.dart  (fromJson del contrato §3)
│   └── repositories/          # auth_repo, vehicles_repo, events_repo,
│                              # commands_repo, push_repo
├── state/
│   ├── auth_state.dart        # ChangeNotifier: splash→login→shell, logout en 401
│   ├── fleet_state.dart       # vehículos + posiciones vivas (REST bootstrap + WS)
│   ├── events_state.dart      # alertas, contador no-reconocidas, ack
│   └── command_state.dart     # ciclo de vida de comandos por vehículo
├── ui/
│   ├── theme/                 # tokens (colores/estados/espaciado), ThemeData
│   ├── widgets/               # StatusDot, VehicleCard, TelemetryTile, EventTile,
│   │                          # CommandButton, ConnectionBanner, Empty/ErrorState
│   └── screens/               # las de siempre + history_screen.dart
└── firebase/                  # push_service.dart (FCM + notificaciones locales)
```

### 2.2 Decisiones técnicas

- **`provider` se mantiene.** Ya está en uso, el equipo lo conoce y la app es pequeña; migrar a Riverpod/BLoC no aporta nada al MVP.
- **Navegación actual se mantiene** (Navigator + shell con tabs). `go_router` solo se introduce si los deep links de push lo exigen más adelante; para el MVP basta un `navigatorKey` global para abrir detalle/alertas desde una notificación.
- **Configuración por `--dart-define`**: `API_URL` y `WS_URL`. Sin default de producción en el código; en debug apunta a `http://10.0.2.2:8000` (emulador Android → localhost). Dos entry points de build: `dev` y `prod` (flavors ligeros vía dart-define, no flavors nativos).
- **Sesión**: al abrir, splash intenta refresh silencioso → shell o login. Interceptor dio: adjunta access token; en 401 hace **un** refresh (con cola: las peticiones concurrentes esperan el refresh en curso, no disparan N refreshes) y reintenta; si el refresh falla → logout limpio.
- **Ciclo de vida**: `AppLifecycleListener` — en background se cierra el WS (ahorro de batería/datos); al volver a foreground: reconectar + refetch de vehículos y alertas (resync). Las alertas en background llegan por FCM, no por WS.

### 2.3 Dependencias (pubspec)

```
Quitar:  cookie_jar, dio_cookie_manager, http
Añadir:  flutter_secure_storage ^9.x, firebase_core, firebase_messaging,
         google_fonts (Inter, opcional)
Quedan:  dio, web_socket_channel, flutter_map, latlong2, provider,
         shared_preferences (solo prefs de UI), flutter_local_notifications,
         intl, timeago
```

---

## 3. Contrato con la API propia

Lo que la app consume (definido en §5 del plan maestro; las Fases 1 y 3 del backend lo implementan — **este contrato es el acuerdo entre ambos frentes**):

| Uso | Endpoint | Notas |
|---|---|---|
| Login | `POST /api/auth/login` | `{email, password}` → `{access_token, refresh_token, user}` |
| Refresh | `POST /api/auth/refresh` | rotatorio; el refresh viejo queda revocado |
| Sesión | `GET /api/auth/me`, `POST /api/auth/logout` | logout revoca el refresh |
| Mis motos | `GET /api/vehicles` | el backend filtra por `user_vehicles` (rol client) |
| Histórico | `GET /api/vehicles/{id}/positions?from&to&simplified=true` | simplificación server-side |
| Alertas | `GET /api/events?…`, `PATCH /api/events/{id}/ack` | |
| Corte | `POST /api/vehicles/{id}/commands` `{type: ENGINE_STOP\|ENGINE_RESUME}` | responde el comando con `status` |
| Estado comando | `GET /api/vehicles/{id}/commands` + push WS `command_status` | |
| Push | `POST /api/push-tokens` `{fcm_token, platform}` | en login y en `onTokenRefresh` |
| WS | `WS /api/ws` → 1er mensaje `{type:"auth", token}` | server empuja `position`, `event`, `vehicle_status`, `command_status` — solo de las motos del usuario |

**Regla de oro del corte de motor (igual que en la web): nunca éxito optimista.** La UI muestra el estado real del comando: `Enviando… → Enviado al dispositivo → ✔ Confirmado` o `✕ Falló / expiró (10 min)`. Mientras haya un comando activo, el botón queda bloqueado.

---

## 4. Sistema de diseño (alineado con la web nueva)

Mismos tokens que `frontend/src/styles/` — una sola identidad visual:

| Token | Valor | Uso |
|---|---|---|
| Fondo | `#F7F8FA` | scaffold |
| Superficie | `#FFFFFF` | cards, sheets, app bar |
| Borde | `#E9ECF1` | divisores, contornos de card (sin sombras duras) |
| Texto | `#111827` / `#6B7280` / `#9CA3AF` | primario / secundario / tenue |
| Acento | `#2563EB` | CTA, tab activa, "detenida" |
| Estados | `#16A34A` movimiento · `#2563EB` detenida · `#9CA3AF` sin señal · `#DC2626` alerta | dots, marcadores, badges |
| Radios | 12–16 px · sombra suave única | cards y sheets |
| Tipografía | Inter (google_fonts) o system | igual que la web |
| Mapa | tiles CARTO `light_all` | mismo lienzo blanco que la web |

Componentes compartidos entre pantallas: `StatusDot` (con pulso en alerta), `VehicleCard`, `TelemetryTile` (icono+label+valor), `EventTile`, `CommandButton` (los 5 estados), `ConnectionBanner` (WS reconectando), `EmptyState`/`ErrorState`/skeletons. Copy en es-CO, fechas con `intl` es_CO, "hace 5 min" con `timeago` es.

---

## 5. Pantallas y flujos — con criterios de "hecho" (DoD)

**Splash / bootstrap** *(nueva)*
- [ ] Logo + refresh silencioso; decide login o shell en < 2 s; sin parpadeo de login si hay sesión.
- **DoD:** matar la app y reabrirla no pide credenciales mientras el refresh sea válido; con refresh revocado cae a login.

**Login** *(rehacer la lógica, conservar el layout)*
- [ ] Campos vacíos (🚨 fuera las credenciales precargadas), validación local, error humano ("correo o contraseña incorrectos"), mensaje de rate-limit, botón con loading.
- **DoD:** login correcto aterriza en Motos con datos reales; token inválido posterior (revocación) expulsa a login con mensaje claro.

**Shell (tabs)**
- [ ] Tabs: Motos, Mapa, Alertas (badge con no-reconocidas), Perfil. `ConnectionBanner` global bajo el app bar cuando el WS está reconectando.

**Motos (home)**
- [ ] `VehicleCard` por moto: estado real (dot + label), placa, velocidad, batería, "visto hace X". Pull-to-refresh. Estados vacío ("Aún no tienes motos asignadas — contacta a SentraSecurity") y error con reintento.
- **DoD:** con el simulador corriendo, la velocidad y el estado cambian en vivo sin tocar nada; el estado offline aparece solo (reloj de 30 s, mismo criterio de 5 min que la web).

**Mapa global**
- [ ] Todos los marcadores con rumbo y color de estado (mismo SVG-flecha que la web), tap → detalle; botón "centrar todas" (fitBounds).
- **DoD:** una moto en movimiento se desplaza suavemente; el mapa no "salta" si el usuario está explorando.

**Detalle de moto**
- [ ] Telemetría completa (`TelemetryTile` ×8: velocidad, rumbo, batería, voltaje, GSM, satélites, ACC, última señal), mini-mapa con seguimiento, accesos a Histórico.
- [ ] **Corte de motor**: sección separada visualmente (zona "peligro"), botón `CommandButton`; confirmación fuerte (bottom sheet: descripción de la consecuencia + deslizar para confirmar o escribir la placa); estados en vivo vía WS; "Restaurar motor" simétrico.
- **DoD:** cortar y restaurar la moto de pruebas desde la app funciona end-to-end con confirmación real del dispositivo; el comando queda auditado en el backend; imposible dispararlo con un solo toque.

**Histórico** *(nueva)*
- [ ] Presets Hoy / Ayer / 7 días + rango custom (date picker es-CO); polyline coloreada por velocidad con inicio/fin; resumen: distancia, tiempo en movimiento, velocidad máx.
- [ ] Reproducción animada: **post-MVP en móvil** (la web la tiene primero).
- **DoD:** 24 h de datos reales (~8 000 puntos, simplificados server-side) cargan fluido en un Android de gama media; rango sin datos muestra estado vacío.

**Alertas** *(reemplaza el placeholder)*
- [ ] Lista real ordenada (no-reconocidas primero), `EventTile` con tipo traducido y color, ack con actualización optimista, filtro simple por moto, tiempo real por WS, badge en tab sincronizado.
- **DoD:** una alarma del simulador aparece en < 5 s con la app abierta; el ack se refleja también en la web (mismo backend).

**Perfil / Ajustes**
- [ ] Datos del usuario (`/auth/me`), cambiar contraseña, toggle de notificaciones por tipo (pref local), versión de la app, **cerrar sesión** (revoca refresh + borra secure storage + desregistra token FCM).
- **DoD:** tras cerrar sesión, reabrir la app pide login y no quedan tokens en el dispositivo.

---

## 6. Notificaciones push (FCM)

- [ ] `firebase_core` + `firebase_messaging`; proyecto Firebase `sentra-gps` (Android primero: `google-services.json` **fuera del repo público** si contiene claves restringidas — va por CI o secrets).
- [ ] Canal Android `alertas_criticas` (importancia máxima + sonido) para EMERGENCY/corte de energía/geocerca; canal `general` para el resto.
- [ ] Registro del token: `POST /api/push-tokens` al login y en `onTokenRefresh`; eliminación al cerrar sesión.
- [ ] Foreground → `flutter_local_notifications` (ya está en el proyecto); background/terminated → notificación del sistema; tap → abre detalle de la moto o la lista de alertas (`navigatorKey`).
- [ ] Backend (soporte en Fase 4 del plan maestro): envío vía **FCM HTTP v1** en eventos críticos; mensajes `priority: high` para atravesar Doze.
- [ ] iOS/APNs: post-MVP junto con S1.

---

## 7. Seguridad móvil

- [ ] **M0 inmediato**: eliminar credenciales e IP hardcodeadas (ver §1). La contraseña expuesta ya está en el checklist de rotación de la Fase 0 global.
- [ ] Tokens solo en `flutter_secure_storage` (Keystore/Keychain); jamás en `shared_preferences` ni en logs.
- [ ] Solo HTTPS/WSS en builds de producción (bloquear cleartext en el manifest de release; permitir `10.0.2.2` solo en debug).
- [ ] R8/ProGuard habilitado en release; sin secretos en el código (el binario se puede descompilar).
- [ ] Certificate pinning: **post-MVP** (documentado como mejora; requiere plan de rotación de certificados).

---

## 8. Plan por fases

| Fase | Contenido | Esfuerzo | Depende de |
|---|---|---|---|
| **M0** | Limpieza urgente: credenciales/IP fuera, `--dart-define`, quitar deps de cookies | 0,5 dp | Nada — **se puede hacer hoy** |
| **M1** | Fundación: tema/tokens, `core/` (api client, storage, config), `AuthState`, splash + login contra API propia | 2 dp | Backend Fase 1 (auth) — mientras no exista, mock repo local |
| **M2** | Datos y tiempo real: modelos + repos, `ws_client` (backoff, lifecycle, resync), Motos + Mapa global con datos propios | 2 dp | M1 |
| **M3** | Detalle + **corte de motor** con estados reales y confirmación fuerte | 1,5 dp | Backend Fase 3 (comandos) |
| **M4** | Alertas reales + Histórico | 2 dp | M2 |
| **M5** | Push FCM + Perfil/ajustes + pulido (vacío/error/offline, accesibilidad táctil ≥44 px) | 1,5 dp | M2; backend FCM |
| **M6** | Beta: APK firmado, Play **internal testing**, smoke en dispositivo real, checklist de paridad → **apagar Traccar** | 1 dp | M1–M5; Fase 1 desplegada |

**Total ≈ 10,5 dp** (consistente con los 8–10 dp de la Fase 4 del plan maestro; el extra es el histórico, que el plan maestro dejaba en "paridad parcial").

**Paralelización (2 devs):** M0 hoy mismo; M1–M2 pueden arrancar contra un **mock** (o contra el backend SQLite + simulador que ya usamos para la demo del frontend — mismo contrato sin auth, con auth simulada en el mock) mientras el backend Fase 1 avanza. M3 es el único bloque duro que espera la Fase 3 del backend. Esto permite que la app y el **panel web admin** (siguiente tema) avancen en paralelo sin pisarse: comparten contrato de API, no código.

---

## 9. Pruebas

- **Unitarias:** `fromJson` de todos los modelos (fixtures del contrato §3), interceptor de refresh (401 → un solo refresh, cola de peticiones concurrentes, logout si falla), parser de mensajes WS, formateadores es-CO, lógica de estado del vehículo (mismos casos que la web: naive timestamps = UTC).
- **Widget:** login (validación/error/loading), `VehicleCard` por estado, `CommandButton` en sus 5 estados, `EventTile` ack.
- **Integración (`integration_test`):** login → Motos → detalle → histórico contra el **backend local SQLite + simulador** (reutilizando `simulator.py` de la demo — se mueve a `tools/` del repo en la Fase 1).
- **Manual por release:** dispositivo Android real de gama media: consumo de batería con la app abierta 30 min, comportamiento con red móvil intermitente (WS reconecta, banner visible), push con la app cerrada.
- **Criterio de salida M6 (= Fase 4 maestro):** un cliente beta con la app instalada ve su moto en vivo, recibe una alerta push con la app cerrada, y el corte de motor funciona con confirmación — todo contra producción con HTTPS. Entonces se apaga Traccar.

---

## 10. Riesgos específicos de móvil

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| RM1 | FCM retrasado/descartado por Doze en alertas críticas | Media | Alto | `priority: high`, canal de importancia máxima; el badge/lista se resincroniza al abrir; medir latencia real en beta |
| RM2 | Corte de motor disparado por accidente desde el celular | Baja | Crítico | Confirmación de dos pasos (sheet + deslizar/placa), auditoría por usuario, opción de restringir corte a admin si el negocio lo prefiere |
| RM3 | Revisión de Play Store demora el hito de apagar Traccar | Media | Medio | **Internal testing** no pasa revisión completa — sirve para la beta; la revisión de producción corre en paralelo |
| RM4 | Fase 3 backend (comandos) se atrasa y bloquea M3 | Media | Medio | M3 es independiente del resto; M4/M5 se adelantan; el botón se oculta tras feature flag hasta que el backend esté |
| RM5 | Dispositivos Android viejos (WebView/TLS antiguos) | Baja | Bajo | minSdk 23, probar en gama baja; tiles CARTO van por HTTPS estándar |

---

## Preguntas abiertas (no bloquean M0–M2)

1. ¿iOS entra al MVP o confirmamos Android primero? (S1; afecta M6 y presupuesto Apple)
2. ¿El corte de motor lo puede disparar el cliente B2C desde la app, o solo operadores de la empresa con el cliente al teléfono? (afecta RM2 y RBAC del backend)
3. ¿Nombre/branding final y assets (ícono, splash) para la ficha de Play Store?
