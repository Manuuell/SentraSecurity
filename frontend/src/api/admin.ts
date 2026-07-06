import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { AdminUser, Role } from "../types";

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/api/admin/users").then((r) => r.data),
    enabled,
  });
}

interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: Role;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserInput) =>
      api.post<AdminUser>("/api/admin/users", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

interface UpdateUserInput {
  id: number;
  full_name?: string;
  phone?: string;
  role?: Role;
  is_active?: boolean;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserInput) =>
      api.patch<AdminUser>(`/api/admin/users/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, new_password }: { id: number; new_password: string }) =>
      api.post(`/api/admin/users/${id}/reset-password`, { new_password }).then((r) => r.data),
  });
}

export function useUserVehicles(userId: number | null) {
  return useQuery({
    queryKey: ["admin-user-vehicles", userId],
    queryFn: () =>
      api
        .get<{ vehicle_ids: string[] }>(`/api/admin/users/${userId}/vehicles`)
        .then((r) => r.data.vehicle_ids),
    enabled: userId !== null,
  });
}

export function useSetUserVehicles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vehicle_ids }: { id: number; vehicle_ids: string[] }) =>
      api
        .put<{ vehicle_ids: string[] }>(`/api/admin/users/${id}/vehicles`, { vehicle_ids })
        .then((r) => r.data.vehicle_ids),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-vehicles", vars.id] });
      qc.invalidateQueries({ queryKey: ["admin-vehicle-owners"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Rastreadores (alta manual y vinculación desde el lado del vehículo)
// ---------------------------------------------------------------------------

export interface VehicleOwner {
  id: number;
  full_name: string;
  email: string;
}

/** Mapa vehicle_id → clientes asignados (columna "Cliente" del panel). */
export function useVehicleOwners() {
  return useQuery({
    queryKey: ["admin-vehicle-owners"],
    queryFn: () =>
      api.get<Record<string, VehicleOwner[]>>("/api/admin/vehicles/owners").then((r) => r.data),
  });
}

interface CreateVehicleInput {
  id: string;
  name: string;
  plate?: string;
  sim_phone?: string;
  owner_user_id?: number;
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVehicleInput) =>
      api.post("/api/admin/vehicles", body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["admin-vehicle-owners"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

export function useSetVehicleUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, user_ids }: { id: string; user_ids: number[] }) =>
      api.put(`/api/admin/vehicles/${id}/users`, { user_ids }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vehicle-owners"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-vehicles"] });
    },
  });
}
