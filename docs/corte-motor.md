# Spike: corte remoto de motor — resultado

> Fecha: 2026-07-05 · Dispositivo: ST-907L en banco de pruebas (aún no instalado en moto)

## Resultado: ✅ confirmado

El canal SMS documentado en el manual (`docs/protocolo-st907l.md` §3) funciona con hardware real:

| Comando | Efecto observado | Respuesta |
|---|---|---|
| `940<password>` | Clic audible del relé (corte) | `SET OK` |
| `941<password>` | Clic audible del relé (restauración) | `SET OK` |

Ambos sentidos probados y confirmados. El equipo sigue con la **contraseña de fábrica `0000`**.

## Lo que queda validado
- El firmware acepta y ejecuta los comandos de plataforma SinoTrack estándar.
- El relé de corte cambia de estado físicamente ante cada comando.
- La respuesta `SET OK` confirma el ciclo sin ambigüedad — sirve como señal de `confirmed` en la máquina de estados de `device_commands`.

## Lo que falta validar (pendiente de instalación en moto)
- Que el relé está cableado al circuito correcto (arranque/encendido) y que **efectivamente impide arrancar** sin afectar frenos ni luces (checklist de instalación en `docs/provisioning-st907l.md`).
- Latencia real del canal SMS del operador (no medida con precisión en esta prueba; a validar en campo).

## Decisión de canal: SMS confirmado como plan A

Se descarta seguir intentando el comando por TCP: el protocolo de subida no define downlink, y SMS ya demostró funcionar de extremo a extremo.

## Pendiente antes de producción

1. **Cambiar la contraseña de fábrica `0000`** del equipo (`777<nueva><vieja>`) antes de instalarlo en la moto — con `0000` cualquiera que conozca el número del SIM puede cortar el motor.
2. **Elegir el gateway SMS** para que el backend envíe los comandos automáticamente (hoy se probó enviando el SMS a mano desde un teléfono):
   - **Módem GSM USB en el VPS + SIM local** (candidata preferida del plan): ciclo cerrado, recibe el `SET OK` de confirmación automáticamente, costo por SMS local.
   - **API de operador/agregador**: menos hardware, pero requiere número entrante para recibir la confirmación y sube el costo por comando.
3. Mientras se decide/instala el gateway automatizado, la cola de comandos (`device_commands`) puede operar en **modo manual**: el backend registra el comando como `pending`, un operador lo envía a mano y lo marca `sent`, y al recibir el `SET OK` (o confirmarlo por otra vía) lo marca `confirmed`. Esto permite construir y probar la UI (web + app) ya mismo, sin esperar el módem.
