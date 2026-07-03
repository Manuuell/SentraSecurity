import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { isAxiosError } from "axios";
import { useAuth } from "../auth/AuthProvider";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 429) {
        setError("Demasiados intentos. Espera un minuto e inténtalo de nuevo.");
      } else if (isAxiosError(err) && err.response?.status === 401) {
        setError("Correo o contraseña incorrectos.");
      } else {
        setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
      }
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: 16,
      }}
    >
      <Paper
        w="100%"
        maw={400}
        p={32}
        radius="lg"
        shadow="sm"
        style={{ border: "1px solid var(--border)" }}
      >
        <Stack gap="lg">
          <Stack gap={10} align="center">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "var(--accent-soft)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <ShieldCheck size={30} color="var(--accent)" />
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={800} fz={22} lh={1.2}>
                SentraSecurity
              </Text>
              <Text fz={13} c="dimmed" mt={4}>
                Monitoreo GPS · Cartagena de Indias
              </Text>
            </div>
          </Stack>

          <form onSubmit={submit}>
            <Stack gap="sm">
              <TextInput
                label="Correo electrónico"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                data-autofocus
                required
                radius="md"
              />
              <PasswordInput
                label="Contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                radius="md"
              />

              {error && (
                <Alert color="red" icon={<AlertCircle size={16} />} p="sm" radius="md">
                  {error}
                </Alert>
              )}

              <Button type="submit" size="md" radius="md" loading={loading} fullWidth mt={4}>
                Ingresar
              </Button>
            </Stack>
          </form>

          <Text fz={11} c="dimmed" ta="center">
            ¿Sin cuenta? Contacta a SentraSecurity para activar tu servicio.
          </Text>
        </Stack>
      </Paper>
    </div>
  );
}
