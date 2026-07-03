import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "../auth/tokens";
import { useLiveStore } from "./liveStore";
import type { PositionMessage, Vehicle } from "../types";

function wsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/ws`;
}

const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_MS = 30_000;

/**
 * Conexión WS única de la app: actualiza la caché de TanStack Query con cada
 * posición. Reconexión con backoff exponencial + jitter y resincronización
 * (refetch) al recuperar la conexión.
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();
  const setWsStatus = useLiveStore((s) => s.setWsStatus);
  const setLastPacketAt = useLiveStore((s) => s.setLastPacketAt);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let heartbeat: number | undefined;
    let reconnectTimer: number | undefined;

    const applyPosition = (msg: PositionMessage) => {
      setLastPacketAt(msg.timestamp);
      const list = queryClient.getQueryData<Vehicle[]>(["vehicles"]);
      if (!list || !list.some((v) => v.id === msg.device_id)) {
        // Vehículo nuevo (el backend los auto-registra): recargar la lista
        queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      } else {
        queryClient.setQueryData<Vehicle[]>(["vehicles"], (prev) =>
          prev?.map((v) =>
            v.id === msg.device_id
              ? {
                  ...v,
                  last_lat: msg.valid ? msg.lat : v.last_lat,
                  last_lon: msg.valid ? msg.lon : v.last_lon,
                  last_speed: msg.speed_kmh,
                  last_direction: msg.direction,
                  last_seen: msg.timestamp,
                  is_online: true,
                  acc_off: msg.acc_off,
                  battery_pct: msg.battery_pct,
                  voltage: msg.voltage,
                  gsm_signal: msg.gsm_signal,
                  satellites: msg.satellites,
                }
              : v,
          ),
        );
      }
      if (msg.alarms?.length) {
        queryClient.invalidateQueries({ queryKey: ["alarms"] });
      }
    };

    const connect = () => {
      if (closed) return;
      setWsStatus(attempt === 0 ? "connecting" : "reconnecting");
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        // Primer mensaje: autenticación (el servidor cierra si no llega en 5 s)
        ws?.send(JSON.stringify({ type: "auth", token: getAccessToken() ?? "" }));
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        let msg: PositionMessage & { type?: string };
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.type === "auth_ok") {
          const recovered = attempt > 0;
          attempt = 0;
          setWsStatus("connected");
          if (recovered) {
            queryClient.invalidateQueries({ queryKey: ["vehicles"] });
            queryClient.invalidateQueries({ queryKey: ["alarms"] });
          }
          heartbeat = window.setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
          }, HEARTBEAT_MS);
          return;
        }
        if (msg.type === "auth_error") {
          // Token vencido justo al conectar: el backoff reintenta y para
          // entonces el interceptor HTTP ya habrá refrescado el access token
          ws?.close();
          return;
        }
        if (msg.event === "position") applyPosition(msg);
      };

      ws.onclose = () => {
        window.clearInterval(heartbeat);
        if (closed) return;
        setWsStatus("reconnecting");
        attempt += 1;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.random() * 500;
        reconnectTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      closed = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(reconnectTimer);
      ws?.close();
      setWsStatus("disconnected");
    };
  }, [queryClient, setWsStatus, setLastPacketAt]);
}
