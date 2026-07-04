# Referencia técnica — SinoTrack ST-907/ST-907L

> Fuente: `Protocol.pdf` (protocolo de datos Tianqin/Totem, dispositivo→servidor) y `Manual.pdf`
> (manual de usuario con comandos SMS), analizados el 2026-07-03. Este documento es la
> referencia canónica del proyecto; los PDFs originales quedan como respaldo.

---

## 1. Protocolo de subida (dispositivo → servidor, TCP)

Solo existen **dos paquetes documentados**, ambos ASCII delimitados por comas, `*` de inicio y `#` de fin. **No hay ningún comando servidor→dispositivo documentado en el protocolo TCP.**

### V6 — arranque (una vez por encendido/reinicio; incluye ICCID)

```
*XX,YYYYYYYYYY,V6,HHMMSS,A,lat,N,lon,E,speed,dir,DDMMYY,vstatus,mcc,mnc,lac,cellid,ICCID#
```

### V8 — reporte periódico (según intervalo configurado; default 20 s)

```
*XX,YYYYYYYYYY,V8,HHMMSS,A,lat,N,lon,E,speed,dir,DDMMYY,vstatus,mcc,mnc,lac,cellid,sats,gsm,voltage,bat#
```

Campos clave (confirmados contra nuestro `server/parser.py`):

| Campo | Formato | Notas |
|---|---|---|
| `XX` | 2 chars | Fabricante (TH, DC, XY…) — ignorable |
| `YYYYYYYYYY` | **10 dígitos** | **Serial del equipo, NO es el IMEI** (corregir comentario en `models.py`) |
| `HHMMSS` + `DDMMYY` | | **Siempre UTC 0** (⚠️ solo si el timezone del equipo queda en `E00`, ver §3) |
| `A/V` | 1 char | A = fix GPS válido, V = inválido |
| `lat` / `lon` | `DDMM.MMMM` / `DDDMM.MMMM` | grados+minutos → decimal = DD + MM.MMMM/60 ✓ |
| `speed` | 000.00–999.99 | **nudos**; km/h = × 1.852 ✓ |
| `dir` | 000–359 | azimut, norte = 0 ✓ |
| `vstatus` | 8 hex chars (4 bytes) | **lógica negativa: bit = 0 → activo**. Ver §2 |
| `voltage` | entero | décimas de voltio: `122` = 12.2 V ✓ |
| `bat` | 0–100 | porcentaje ✓ |

**Variante WiFi de V8** ⚠️: la tabla detallada del protocolo incluye, entre `cellid` y `sats`,
hasta **3 pares `bssid,rssi`** (MAC + señal WiFi, 6 campos extra → 27 campos en total).
Nuestro parser hoy asume 21 campos: con un firmware WiFi los campos extendidos se
perderían (no crashea, pero `sats/gsm/voltage/bat` quedarían nulos). **Endurecer el parser
en Fase 1**: si `len(parts) >= 27` y `parts[17]` parece MAC hex, desplazar el offset +6.

**V1 (legado)**: el protocolo menciona que firmware nuevo "ya no transmite V1". Mantener
el parser tolerante a paquetes cortos (heartbeats/V1 viejos) sin crashear.

---

## 2. Tabla de bits de `vehicle_status` (Apéndice 1, verificada)

Lógica negativa: **bit = 0 significa activo**. Bits marcados "—" son reservados.

| Bit | Byte 1 (unidad) | Byte 2 (vehículo) | Byte 3 (estado) | Byte 4 (alarmas) |
|---|---|---|---|---|
| 0 | — (1) | — (1) | — (0 por defecto) | — (1) |
| 1 | **Alarma de desplazamiento** | **Alarma de vibración** | **Armado** | **Alarma de emergencia (SOS)** |
| 2 | Reporte de datos perdidos | — | **ACC apagado** | **Exceso de velocidad** |
| 3–4 | — | — | — | — |
| 5 | — | — | — | **Batería baja** |
| 6 | — | — | — | **Batería baja** (bit duplicado) |
| 7 | — | — | — | — |

### Correcciones que esto exige en `server/parser.py` (Fase 1)

1. 🐛 **Vibración está en byte 2 bit 1, no bit 0.** Hoy: `vibration_alarm=not bit(b[1], 0)` →
   debe ser `not bit(b[1], 1)`. Con el código actual, una vibración real **no se detecta**.
2. **Batería baja**: leer bit 5 **o** bit 6 del byte 4 (hoy solo bit 5).
3. Nota para fixtures: el byte 3 tiene bit 0 = 0 "de fábrica" — un estado neutro no es
   necesariamente `FFFFFFFF` (p. ej. puede ser `FFFFFEFF`). Capturar tramas reales.
4. Confirmados correctos: desplazamiento (b1·bit1), armado (b3·bit1), ACC (b3·bit2),
   emergencia (b4·bit1), exceso de velocidad (b4·bit2).

---

## 3. Comandos SMS (teléfono/gateway → SIM del tracker)

Contraseña por defecto del equipo: **`0000`** (¡cambiarla en el aprovisionamiento!).
El tracker responde `SET OK` por SMS al remitente.

### 🔑 Corte de motor — **respuesta al spike R1 del plan maestro**

| Acción | Comando SMS | Ejemplo (pwd 0000) |
|---|---|---|
| **Cortar motor** | `940` + password | `9400000` |
| **Restaurar motor** | `941` + password | `9410000` |

**El canal documentado para el corte es SMS, no TCP.** El protocolo TCP no define ningún
downlink. Implicaciones para la arquitectura (ver §5).

### Aprovisionamiento (secuencia por moto nueva)

| Paso | Comando | Ejemplo |
|---|---|---|
| 1. APN del operador | `803`+pwd+` `+APN[+` `+user+` `+pass] | `8030000 internet.movistar.com.co` |
| 2. Servidor propio | `804`+pwd+` `+IP+` `+puerto | `8040000 <IP_VM> 5013` (5013 público → 8090 interno) |
| 3. Intervalo de subida | `805`+pwd+` `+segundos (10–18000; 0 = apaga GPRS) | `8050000 15` |
| 4. Zona horaria **UTC** | `896`+pwd+`E00` | `8960000E00` — **nunca otra: el parser asume UTC** |
| 5. Cambiar contraseña | `777`+nueva+vieja | `77785310000` |
| 6. Números de control (hasta 3) | número+pwd+` `+serial | `573001234567XXXX 1` |
| 7. Alarma de vibración | `181`+pwd+`T`+segundos (0–120) / off: `180`+pwd | `1810000T10` |
| 8. Exceso de velocidad (km/h) | `122`+pwd+` `+vel (0 = off) | `1220000 80` |
| 9. Verificar todo | `RCONF` (responde config completa) | — |

### Otros comandos útiles

| Función | Comando |
|---|---|
| Modo GPRS (default) / SMS | `710`+pwd / `700`+pwd |
| Ubicación con link de Google | `669`+pwd (o llamar al SIM: responde con link) |
| Geocerca del equipo on/off/radio | `211`+pwd / `210`+pwd / `005`+pwd+` `+metros (las nuestras son server-side; dejar OFF) |
| Kilometraje reset/leer | `142`+pwd[`M`+metros] / `143`+pwd |
| Modo llamada on/off (alarmas llaman además de SMS) | `150`+pwd / `151`+pwd |
| Modo sueño (T min detenido; 0 = off) | `SLEEP`+pwd+` `+T ⚠️ afecta la lógica online/offline: dejar OFF o documentar |
| Reiniciar / leer configuración | `RESTART` / `RCONF` |

### Notas de energía y alarmas
- Escala de batería en SMS de alarma: Bat 5=100 %, 4=80 %, 3=60 %, 2=40 %, 1=20 % (con 1 envía alarma de batería baja). En V8 llega como porcentaje 0–100.
- Las alarmas SMS van a los números de control; las de plataforma llegan por los bits de `vstatus` en V8 → nuestro backend las convierte en eventos/push.

---

## 4. Credenciales por defecto del ecosistema (riesgo)

- Plataforma SinoTrack Pro: usuario = ID del tracker, contraseña **`123456`** → cualquiera
  que vea el serial de un tracker puede entrar a la plataforma del fabricante. **Si algún
  equipo fue usado con esa plataforma, cambiar esa contraseña o no registrar los equipos ahí.**
- Contraseña del equipo: **`0000`** → cambiarla siempre (paso 5 del aprovisionamiento);
  cualquiera con el número del SIM podría cortar el motor con `9400000`.
- Guardar la contraseña por equipo en la BD (`vehicles.command_password`, cifrada) — la
  necesita el gateway SMS para armar `940`/`941`.

---

## 5. Implicaciones para la arquitectura (ajustes al plan maestro)

1. **El corte de motor va por SMS** (plan A, ya no plan B). El flujo `device_commands` del
   plan (§5.2) se mantiene igual de cara a la API y las apps, pero el "canal" del ingest
   cambia por un **gateway SMS**:
   - `pending` → API crea el comando · `sent` → SMS `940/941+pwd` enviado al SIM del tracker
   - `confirmed` → llega el SMS de respuesta `SET OK` (el gateway debe poder **recibir**)
   - `failed/expired` → sin respuesta en TTL (reintento manual)
2. **Opciones de gateway SMS** (decidir en el spike, criterio costo/latencia):
   - **Módem GSM USB en la VM con SIM local** (Claro/Tigo/Movistar): ciclo cerrado
     (envía y recibe el `SET OK`), costo por SMS local, sin dependencia externa. *Candidata preferida.*
   - API del operador o agregador (Twilio y similares): menos hardware, pero recibir la
     respuesta exige número entrante y sube el costo por comando.
3. **El spike con hardware real sigue siendo necesario** para: (a) confirmar que `940/941`
   acciona el relé tal como está cableado; (b) probar si el firmware también acepta el
   comando por el socket TCP (no documentado — si funcionara, ahorraría SMS); (c) medir
   latencia SMS→corte con operador local; (d) capturar tramas reales para fixtures.
4. **Provisioning**: la secuencia §3 se convierte en `docs/provisioning-st907l.md` +
   checklist del técnico instalador (el plan maestro §6.5 ya lo pedía; esta es la base).
5. **Parser Fase 1**: los 3 fixes de §2 + soporte variante WiFi + fixtures de tramas reales.
