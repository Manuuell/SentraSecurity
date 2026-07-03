import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Alarm } from "../types";

export function useAlarms() {
  return useQuery({
    queryKey: ["alarms"],
    queryFn: () =>
      api.get<Alarm[]>("/api/alarms", { params: { limit: 200 } }).then((r) => r.data),
    refetchInterval: 60_000,
  });
}

export function useAckAlarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alarmId: number) =>
      api.patch<Alarm>(`/api/alarms/${alarmId}/acknowledge`).then((r) => r.data),
    // Optimista: se marca reconocida de inmediato y se revierte si falla
    onMutate: async (alarmId) => {
      await queryClient.cancelQueries({ queryKey: ["alarms"] });
      const previous = queryClient.getQueryData<Alarm[]>(["alarms"]);
      queryClient.setQueryData<Alarm[]>(["alarms"], (prev) =>
        prev?.map((a) => (a.id === alarmId ? { ...a, acknowledged: true } : a)),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["alarms"], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["alarms"] });
    },
  });
}
