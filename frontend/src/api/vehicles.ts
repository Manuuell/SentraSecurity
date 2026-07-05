import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { toNaiveUtcIso } from "../lib/format";
import type { TrackPoint, Vehicle } from "../types";

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api.get<Vehicle[]>("/api/vehicles").then((r) => r.data),
    // Red de seguridad si el WS está caído; el WS es la vía principal
    refetchInterval: 60_000,
  });
}

export function useTrackToday(vehicleId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["track-today", vehicleId],
    queryFn: () =>
      api.get<TrackPoint[]>(`/api/vehicles/${vehicleId}/track/today`).then((r) => r.data),
    enabled: enabled && vehicleId !== null,
    refetchInterval: enabled ? 30_000 : false,
  });
}

/** Imagen de Street View de la última posición conocida (o null si no aplica/hay). */
export function useVehicleStreetview(vehicleId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["streetview", vehicleId],
    queryFn: () =>
      api
        .get(`/api/vehicles/${vehicleId}/streetview`, { responseType: "blob" })
        .then((r) => r.data as Blob),
    enabled: enabled && vehicleId !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Histórico de posiciones en un rango arbitrario (milisegundos epoch). */
export function usePositions(vehicleId: string | null, fromMs: number, toMs: number) {
  return useQuery({
    queryKey: ["positions", vehicleId, fromMs, toMs],
    queryFn: () =>
      api
        .get<TrackPoint[]>(`/api/vehicles/${vehicleId}/positions`, {
          params: { since: toNaiveUtcIso(fromMs), until: toNaiveUtcIso(toMs), limit: 5000 },
        })
        .then((r) => r.data),
    enabled: vehicleId !== null,
    staleTime: 30_000,
  });
}

interface UpdateVehicleInput {
  id: string;
  name?: string;
  plate?: string;
  sim_phone?: string;
  command_password?: string;
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateVehicleInput) =>
      api.patch<Vehicle>(`/api/vehicles/${id}`, body).then((r) => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData<Vehicle[]>(["vehicles"], (prev) =>
        prev?.map((v) => (v.id === updated.id ? updated : v)),
      );
    },
  });
}
