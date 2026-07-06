# Sesión — Street View en el panel y la app móvil

**Fecha:** 5 de julio de 2026
**Alcance:** llevar Street View (vista de calle de Google) a la última posición conocida de cada vehículo — primero como imagen estática server-side, después como panorama interactivo en la web y como imagen en la app móvil.

---

## 1. Street View server-side (commit `9966009`)

- Nuevo endpoint `GET /api/vehicles/{device_id}/streetview` en `server/api/routes.py`: proxy server-side hacia la Street View Static API de Google. La API key (`GOOGLE_STREETVIEW_API_KEY`) vive solo en el servidor y nunca llega al navegador.
- Reutiliza `_require_vehicle` (mismo control de acceso que el resto de endpoints de vehículo); responde 404 si el vehículo no tiene posición conocida o si Street View no está configurado en el servidor.
- Nueva dependencia `httpx` en `requirements.txt` para la llamada saliente.
- Frontend (`VehicleDetailPanel.tsx`, `api/vehicles.ts`): hook `useVehicleStreetview` que pide la imagen como blob y muestra un `Skeleton` mientras carga.
- `docker-compose.yml` y `.env.example` documentados con la nueva variable `GOOGLE_STREETVIEW_API_KEY` (vacía = la función se desactiva sola, sin romper nada más).

### Antes de tocar el VPS

- Se revisó el `docker-compose.yml` de producción: **no reenvía todo el `.env` al contenedor automáticamente** — cada variable se declara a mano en el bloque `environment:`. Sin agregar `GOOGLE_STREETVIEW_API_KEY` ahí, la clave se habría quedado en el `.env` del servidor sin llegar nunca al proceso de Python.
- Se agregó la variable al `docker-compose.yml` de producción, siguiendo el mismo patrón que `GOOGLE_APPLICATION_CREDENTIALS`.
- Por SSH: se agregó `GOOGLE_STREETVIEW_API_KEY` al `.env` real del VPS (verificado que no quedó duplicada).
- **No se reinició el contenedor en ese momento** — el commit del endpoint todavía no estaba desplegado (el último commit en el servidor era el de las tarjetas del CTA), así que reiniciar no habría tenido efecto.
- El pipeline de GitHub Actions (`deploy.yml`) hace `git pull` + `docker compose up -d --build` en cada push a `main`, así que al hacer push del commit el contenedor se reconstruyó solo, ya con la variable disponible.

---

## 2. Street View interactivo (web) + app móvil (commit `197be69`)

Pedido del usuario: que el Street View "dejara interactuar" (arrastrar y mirar alrededor) en la web, y que llegara también a la app móvil.

### Web interactiva

- `frontend/src/lib/googleMaps.ts` (nuevo): carga el SDK de Google Maps JS una sola vez (promesa cacheada), a partir de `VITE_GOOGLE_MAPS_KEY`.
- `VehicleDetailPanel.tsx`:
  - `InteractiveStreetView` monta un `google.maps.StreetViewPanorama` navegable y usa `StreetViewService.getPanorama` para confirmar que hay cobertura antes de mostrarlo.
  - `StreetViewPreview` decide entre la versión interactiva y la estática: **si no hay `VITE_GOOGLE_MAPS_KEY` configurada, cae automáticamente a la versión estática server-side** (la que ya funcionaba) — el feature nunca rompe, solo mejora cuando se activa la key de cliente.
- `@types/google.maps` agregado como dev dependency.
- Variables y CI: `VITE_GOOGLE_MAPS_KEY` documentada en `frontend/.env.example` y agregada a `deploy.yml` para que el build de producción la incluya desde un GitHub Secret.
- Verificación: `tsc && vite build` completo sin errores; preview local confirmado usando el fallback estático (sin key local configurada).

### App móvil (Flutter)

- `mobile/lib/state/sentra_service.dart`: `getStreetview()` pide los bytes de la misma imagen estática vía Dio.
- `mobile/lib/screens/device_screen.dart`: `_StreetViewCard`, debajo del mini-mapa. El `Future` se guarda en el estado (`initState`/`didUpdateWidget`) para que no se vuelva a disparar en cada rebuild — la pantalla se reconstruye seguido con cada actualización del WebSocket.
- Sin interactividad en móvil todavía (solo imagen estática) — requeriría investigar un plugin de Flutter para panoramas.
- `dart analyze` limpio en ambos archivos modificados; se quitó un import redundante de `dart:typed_data` en `sentra_service.dart` (`Uint8List` ya llega vía `flutter/foundation.dart`).
- Este cambio **no se despliega solo con el push**: hay que recompilar y redistribuir el APK para que llegue a los usuarios.

---

## 3. Configuración del GitHub Secret `VITE_GOOGLE_MAPS_KEY`

Detalle importante que salió en la sesión: la key de Maps JavaScript API (cliente) no puede compartir key con restricción de referrer si esa misma key también la usa el backend por `httpx` — las peticiones server-side no llevan `Referer` de navegador y Google las rechazaría igual que a cualquier origen no autorizado. Una key de Google solo admite un tipo de restricción de aplicación (referrer O IP, no ambas a la vez).

Dos caminos evaluados:

1. **Rápido (elegido para esta fase de prueba):** reusar la misma key que ya usa el backend, sin restricción de referrer. Funciona en ambos lados, pero queda completamente abierta en el navegador.
2. **Correcto (pendiente antes de usuarios reales):** crear una segunda key en el mismo proyecto de Google Cloud, restringida por referrer a `sentrasecurity.duckdns.org`, solo con "Maps JavaScript API" habilitada; la key original se queda sirviendo solo al backend.

Se configuró el secret en GitHub siguiendo la opción rápida, para probar de inmediato.

> **Nota de seguridad:** la clave real no se documenta en este archivo a propósito. El repo de GitHub (`Manuuell/SentraSecurity`) es **público**, y esta key hoy no tiene restricción de referrer — cualquiera que la vea en texto plano podría usarla contra el proyecto de Google Cloud. Se guardó únicamente como GitHub Secret (`VITE_GOOGLE_MAPS_KEY`), nunca en el código ni en commits.

---

## 4. Incidente: el secret se creó después del deploy

- Al revisar el historial de GitHub Actions se encontró que el secret se creó **~10 minutos después** de que ya se había desplegado el commit del Street View interactivo — ese build corrió sin la key disponible, así que producción seguía sirviendo la versión estática.
- Se volvió a disparar el workflow manualmente (`workflow_dispatch`, sin necesidad de un commit nuevo) para que corriera ya con el secret disponible.
- Resultado: tests + build + despliegue + health check, todo verde. El build de producción ahora sí incluye `VITE_GOOGLE_MAPS_KEY`.

---

## Pendientes

1. **Separar las keys de Google Maps** (server-side sin restricción vs. cliente restringida por referrer) antes de tener usuarios reales — ver sección 3.
2. **Recompilar y redistribuir el APK** de la app móvil para que el cambio llegue a los usuarios (el push a `main` no lo hace solo).
3. Confirmar visualmente en `sentrasecurity.duckdns.org` que el panorama interactivo se ve (arrastrable) en vez de la imagen estática; si no, revisar que "Maps JavaScript API" esté habilitada en el proyecto de Google Cloud.
