import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Geofence, GeofenceGeometry, GeofenceKind, GeofenceVehicleLink } from "../types";

const KEY = ["geofences"];

export function useGeofences() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Geofence[]>("/api/geofences").then((r) => r.data),
  });
}

export interface CreateGeofenceInput {
  name: string;
  kind: GeofenceKind;
  geometry: GeofenceGeometry;
  color?: string;
  vehicles?: GeofenceVehicleLink[];
}

export function useCreateGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGeofenceInput) =>
      api.post<Geofence>("/api/geofences", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface UpdateGeofenceInput {
  id: number;
  name?: string;
  color?: string;
  is_active?: boolean;
  kind?: GeofenceKind;
  geometry?: GeofenceGeometry;
}

export function useUpdateGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateGeofenceInput) =>
      api.patch<Geofence>(`/api/geofences/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/geofences/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetGeofenceVehicles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vehicles }: { id: number; vehicles: GeofenceVehicleLink[] }) =>
      api.put<Geofence>(`/api/geofences/${id}/vehicles`, { vehicles }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
