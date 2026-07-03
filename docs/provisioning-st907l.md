# Guía de aprovisionamiento e instalación — ST-907L

> Procedimiento para poner en marcha un rastreador SinoTrack ST-907L nuevo y dejarlo
> reportando al servidor de SentraSecurity. Pensado para el **técnico instalador**.
> Referencia del protocolo y los comandos: [protocolo-st907l.md](protocolo-st907l.md).

---

## Antes de ir a la moto — preparación de oficina

**Datos que debes tener a la mano (los entrega SentraSecurity):**

| Dato | Valor | Ejemplo |
|---|---|---|
| IP del servidor | `__________` | (IP pública de la VM) |
| Puerto TCP | **8090** | fijo |
| APN del operador del SIM | `__________` | Claro: `internet.comcel.com.co` · Movistar: `internet.movistar.com.co` · Tigo: `web.colombiamovil.com.co` |
| Usuario/clave APN (si aplica) | casi siempre vacío | — |
| Contraseña nueva del equipo | `__________` | **NO usar `0000`** — asignar una por equipo y registrarla en el sistema |
| Intervalo de reporte | **15 s** | 10–18000; 15 s es buen balance datos/precisión para moto |

**SIM:**
- [ ] SIM normal (tamaño correcto), **sin PIN** y con **datos activos** (plan M2M o prepago con datos).
- [ ] Anotar el número del SIM y el ICCID → se registran junto al equipo en el panel admin.

> 💡 El panel admin de SentraSecurity tiene una herramienta **"Aprovisionamiento"** que genera
> automáticamente los SMS de abajo con la IP, el APN y la contraseña ya rellenados. Úsala para
> no equivocarte al teclear.

---

## Paso 1 · Encender y verificar SIM/GPS

1. [ ] Abrir la tapa (tornillo) e insertar el SIM en la posición correcta.
2. [ ] Conectar alimentación externa. El equipo enciende.
3. [ ] Dejarlo **a cielo abierto ~30 s** (la antena GPS hacia arriba, no bajo metal).
4. [ ] Verificar LEDs:
   - **Azul (GPS):** parpadea = buscando · fijo = GPS OK.
   - **Naranja (GSM):** parpadea = sin SIM/registrando · fijo = GSM OK.
5. [ ] Llamar al número del SIM: debe colgar y responder con un SMS de ubicación (link de Google). Eso confirma SIM + GPS.

---

## Paso 2 · Configurar por SMS (en orden)

> La contraseña de fábrica es `0000`. Los primeros comandos la usan; el paso 2.5 la cambia.
> A partir de ahí, usa la **contraseña nueva**. El equipo responde `SET OK` a cada comando.

**2.1 · APN** (con contraseña de fábrica `0000`)
```
8030000 <APN>
```
Ejemplo Claro: `8030000 internet.comcel.com.co`
Si el APN pide usuario/clave: `8030000 <APN> <user> <pass>`

**2.2 · Servidor (IP y puerto)**
```
8040000 <IP_DEL_SERVIDOR> 8090
```

**2.3 · Intervalo de reporte** (15 s)
```
8050000 15
```

**2.4 · Zona horaria = UTC** ⚠️ **obligatorio**
```
8960000E00
```
> El backend interpreta la hora de las tramas como UTC. Si el equipo queda en otra zona,
> los horarios saldrán corridos. **No cambiar este valor.**

**2.5 · Cambiar la contraseña de fábrica** ⚠️ **seguridad — no omitir**
```
777<NUEVA><0000>
```
Ejemplo (nueva = 8531): `77785310000`
> Con la contraseña se puede **cortar el motor por SMS**. Si se queda en `0000`, cualquiera
> con el número del SIM podría hacerlo. Registrar la nueva contraseña en el panel.

**2.6 · Alarma de vibración** (opcional, recomendado antirrobo — usa contraseña **nueva**)
```
181<NUEVA>T10
```
`T10` = sensibilidad 10 s (0–120). Para apagarla: `180<NUEVA>`.

**2.7 · Exceso de velocidad** (opcional, km/h; usa contraseña **nueva**)
```
122<NUEVA> 80
```
`0` = desactivar.

> **Dejar OFF** la geocerca del equipo (`210<pwd>`) y el modo sueño (`SLEEP<pwd> 0`): las
> geocercas se manejan en el servidor y el modo sueño interfiere con el estado en línea/offline.

---

## Paso 3 · Verificar configuración

Enviar:
```
RCONF
```
El equipo responde con toda su config. Confirmar:
- [ ] `APN:` correcto
- [ ] `IP:<IP_DEL_SERVIDOR>:8090`
- [ ] `MODE:GPRS`
- [ ] `GPRS UPLOAD TIME:15`
- [ ] `TIME ZONE:E00`
- [ ] `SLEEP MODE:OFF`

Si algo está mal, repetir el comando correspondiente del Paso 2.

---

## Paso 4 · Confirmar en línea

- [ ] Avisar a SentraSecurity que el equipo `<ID de 10 dígitos>` está aprovisionado.
- [ ] En el **panel admin** el equipo debe aparecer **En línea** con posición válida en < 1 min.
- [ ] Registrar en el panel: nombre de la moto, placa, ICCID, número del SIM, contraseña del equipo, notas de instalación.

---

## Paso 5 · Instalación física en la moto

1. [ ] **Antena GPS hacia el cielo**, sin metal encima (plástico/vidrio OK). Ubicación oculta pero con vista al cielo (bajo el asiento, tras el carenaje plástico).
2. [ ] **Alimentación** a la batería de la moto (respetar polaridad y voltaje del equipo).
3. [ ] **Relé de corte** (si el equipo lo trae y el negocio lo ofrece): intercalar en el circuito indicado por el manual del relé. ⚠️ **Nunca** cortar frenos/luces; el corte debe impedir el arranque, no crear un peligro en marcha.
4. [ ] Fijar el equipo para que no vibre suelto (dispara falsas alarmas de vibración).
5. [ ] Reponer carenaje y **probar en movimiento**: dar una vuelta y confirmar en el panel que la ruta se dibuja.

---

## Prueba del corte de motor (solo si hay relé instalado)

> Hacer con la moto **detenida y segura**, motor apagado.

- [ ] Desde el panel/gateway, enviar corte. El equipo responde `SET OK` y activa el relé.
- [ ] Intentar arrancar: **no debe encender**.
- [ ] Enviar restauración. `SET OK`. Arrancar: **enciende normal**.
- [ ] Registrar en el panel que el corte quedó **verificado** para esa moto.

Comandos SMS de referencia (el gateway los envía automáticamente; aquí por si hay que hacerlo manual):
`940<contraseña>` corta · `941<contraseña>` restaura.

---

## Solución de problemas rápida

| Síntoma | Causa probable | Acción |
|---|---|---|
| No aparece en el panel | APN o IP mal, sin datos en el SIM | `RCONF` y revisar APN/IP; confirmar plan de datos |
| Aparece pero "Sin señal GPS" (V) | Antena tapada/bajo metal | Reubicar antena a cielo abierto |
| Hora corrida en los reportes | Zona horaria ≠ E00 | Reenviar `8960000E00` |
| Falsas alarmas de vibración | Equipo suelto o sensibilidad alta | Fijar mejor; subir `T` en `181` |
| No responde a SMS | Contraseña equivocada | Probar `0000` (fábrica) o la registrada; `RCONF` |
| No corta el motor | Relé mal cableado o contraseña equivocada | Revisar cableado del relé; confirmar contraseña en el panel |

---

## Registro por equipo (llenar en el panel admin)

```
ID (10 díg.):        __________________
Nombre / placa:      __________________
ICCID:               __________________
Número SIM:          __________________
Operador / APN:      __________________
Contraseña equipo:   __________________   (¡no 0000!)
¿Relé de corte?:     Sí / No     Verificado: Sí / No
Fecha instalación:   __________________
Técnico:             __________________
Notas:               __________________
```
