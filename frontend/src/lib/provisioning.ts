/**
 * Generador de la secuencia de SMS de aprovisionamiento del ST-907L.
 * Comandos según docs/protocolo-st907l.md §3 (manual oficial SinoTrack).
 * La contraseña de fábrica es 0000; los primeros comandos la usan y el paso 5 la cambia.
 */

export interface OperatorPreset {
  id: string;
  label: string;
  apn: string;
}

export const OPERATORS: OperatorPreset[] = [
  { id: "claro", label: "Claro", apn: "internet.comcel.com.co" },
  { id: "movistar", label: "Movistar", apn: "internet.movistar.com.co" },
  { id: "tigo", label: "Tigo", apn: "web.colombiamovil.com.co" },
  { id: "wom", label: "WOM", apn: "internet.wom.co" },
  { id: "custom", label: "Otro (manual)", apn: "" },
];

export interface ProvisioningInput {
  serverIp: string;
  port: string;
  apn: string;
  intervalSec: number;
  newPassword: string;
  overspeedKmh: number; // 0 = desactivado
  vibration: boolean;
}

export interface SmsStep {
  n: number;
  title: string;
  sms: string;
  note?: string;
  warn?: boolean;
}

const FACTORY_PW = "0000";

export function buildSmsSequence(i: ProvisioningInput): SmsStep[] {
  const p = i.newPassword.trim() || FACTORY_PW;
  const steps: SmsStep[] = [
    {
      n: 1,
      title: "Configurar APN",
      sms: `803${FACTORY_PW} ${i.apn.trim()}`,
      note: "Si el APN requiere usuario y clave: 803" + FACTORY_PW + " APN usuario clave",
    },
    {
      n: 2,
      title: "Apuntar al servidor",
      sms: `804${FACTORY_PW} ${i.serverIp.trim()} ${i.port.trim()}`,
    },
    {
      n: 3,
      title: "Intervalo de reporte",
      sms: `805${FACTORY_PW} ${i.intervalSec}`,
      note: `Cada ${i.intervalSec} s (rango 10–18000).`,
    },
    {
      n: 4,
      title: "Zona horaria UTC",
      sms: `896${FACTORY_PW}E00`,
      note: "Obligatorio: el servidor interpreta la hora como UTC.",
      warn: true,
    },
    {
      n: 5,
      title: "Cambiar la contraseña de fábrica",
      sms: `777${p}${FACTORY_PW}`,
      note:
        p === FACTORY_PW
          ? "⚠️ Define una contraseña distinta de 0000: con ella se corta el motor por SMS."
          : "A partir de aquí se usa la contraseña nueva.",
      warn: true,
    },
  ];

  if (i.vibration) {
    steps.push({ n: steps.length + 1, title: "Alarma de vibración", sms: `181${p}T10` });
  }
  if (i.overspeedKmh > 0) {
    steps.push({
      n: steps.length + 1,
      title: "Alarma de exceso de velocidad",
      sms: `122${p} ${i.overspeedKmh}`,
      note: `Avisa por encima de ${i.overspeedKmh} km/h.`,
    });
  }

  steps.push({
    n: steps.length + 1,
    title: "Verificar configuración",
    sms: "RCONF",
    note: "El equipo responde su config: confirma APN, IP:puerto, MODE:GPRS, TIME ZONE:E00.",
  });

  return steps;
}
