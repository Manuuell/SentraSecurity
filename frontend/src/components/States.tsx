import { Button, Stack, Text } from "@mantine/core";
import { Bike, RefreshCw, SearchX } from "lucide-react";

export function EmptyState({ searching = false }: { searching?: boolean }) {
  return (
    <Stack align="center" gap={8} py={40} px="md">
      {searching ? (
        <SearchX size={36} color="var(--text-faint)" strokeWidth={1.5} />
      ) : (
        <Bike size={36} color="var(--text-faint)" strokeWidth={1.5} />
      )}
      <Text fw={600} fz={14}>
        {searching ? "Sin resultados" : "Aún no hay motos"}
      </Text>
      <Text fz={12} c="dimmed" ta="center">
        {searching
          ? "Prueba con otro nombre o placa."
          : "Los rastreadores se registran automáticamente al enviar su primera posición."}
      </Text>
    </Stack>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Stack align="center" gap={10} py={40} px="md">
      <Text fw={600} fz={14}>
        No se pudo conectar con el servidor
      </Text>
      <Text fz={12} c="dimmed" ta="center">
        Verifica que la API esté en ejecución e inténtalo de nuevo.
      </Text>
      <Button size="xs" variant="light" leftSection={<RefreshCw size={14} />} onClick={onRetry}>
        Reintentar
      </Button>
    </Stack>
  );
}
