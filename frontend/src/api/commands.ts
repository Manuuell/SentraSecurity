import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { CommandType, DeviceCommand } from "../types";

/** Mientras haya un comando pendiente/enviado conviene refrescar seguido
 * para ver el cambio de estado sin que el operador tenga que recargar. */
export function useVehicleCommands(vehicleId: string | null) {
  return useQuery({
    queryKey: ["commands", vehicleId],
    queryFn: () =>
      api
        .get<DeviceCommand[]>(`/api/vehicles/${vehicleId}/commands`, { params: { limit: 10 } })
        .then((r) => r.data),
    enabled: vehicleId !== null,
    refetchInterval: 10_000,
  });
}

export function useCreateCommand(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: CommandType) =>
      api.post<DeviceCommand>(`/api/vehicles/${vehicleId}/commands`, { type }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commands", vehicleId] }),
  });
}

interface UpdateStatusInput {
  id: number;
  status: "sent" | "confirmed" | "failed";
  error?: string;
}

export function useUpdateCommandStatus(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateStatusInput) =>
      api.patch<DeviceCommand>(`/api/commands/${id}/status`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commands", vehicleId] }),
  });
}
