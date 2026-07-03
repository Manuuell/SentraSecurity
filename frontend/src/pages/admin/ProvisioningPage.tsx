import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Grid,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { Check, Copy, Info, TriangleAlert } from "lucide-react";
import { OPERATORS, buildSmsSequence } from "../../lib/provisioning";

export default function ProvisioningPage() {
  const [params] = useSearchParams();
  const deviceId = params.get("id") ?? "";

  const [serverIp, setServerIp] = useState("");
  const [port, setPort] = useState("8090");
  const [operator, setOperator] = useState("claro");
  const [customApn, setCustomApn] = useState("");
  const [intervalSec, setIntervalSec] = useState<number>(15);
  const [newPassword, setNewPassword] = useState("");
  const [overspeed, setOverspeed] = useState<number>(80);
  const [vibration, setVibration] = useState(true);

  const apn = operator === "custom" ? customApn : OPERATORS.find((o) => o.id === operator)?.apn ?? "";

  const steps = useMemo(
    () =>
      buildSmsSequence({
        serverIp,
        port,
        apn,
        intervalSec,
        newPassword,
        overspeedKmh: overspeed,
        vibration,
      }),
    [serverIp, port, apn, intervalSec, newPassword, overspeed, vibration],
  );

  const ready = serverIp.trim().length > 0 && apn.trim().length > 0;
  const allSms = steps.map((s) => `${s.title}: ${s.sms}`).join("\n");

  return (
    <Grid gutter="lg">
      <Grid.Col span={{ base: 12, md: 5 }}>
        <div className="admin-card">
          <Text fw={700} fz={15} mb={4}>
            Datos del equipo
          </Text>
          <Text fz={13} c="dimmed" mb="md">
            Genera la secuencia exacta de SMS para dejar el rastreador reportando al servidor.
          </Text>
          <Stack gap="sm">
            {deviceId && (
              <TextInput label="ID del rastreador" value={deviceId} disabled />
            )}
            <TextInput
              label="IP del servidor"
              placeholder="p. ej. 158.101.105.13"
              value={serverIp}
              onChange={(e) => setServerIp(e.currentTarget.value)}
              required
            />
            <TextInput label="Puerto TCP" value={port} onChange={(e) => setPort(e.currentTarget.value)} />
            <Select
              label="Operador (APN)"
              data={OPERATORS.map((o) => ({ value: o.id, label: o.label }))}
              value={operator}
              onChange={(v) => setOperator(v ?? "claro")}
              allowDeselect={false}
            />
            {operator === "custom" && (
              <TextInput
                label="APN manual"
                placeholder="apn.deloperador.com"
                value={customApn}
                onChange={(e) => setCustomApn(e.currentTarget.value)}
              />
            )}
            <NumberInput
              label="Intervalo de reporte (s)"
              value={intervalSec}
              onChange={(v) => setIntervalSec(Number(v) || 15)}
              min={10}
              max={18000}
            />
            <TextInput
              label="Contraseña nueva del equipo"
              placeholder="distinta de 0000"
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
            />
            <NumberInput
              label="Exceso de velocidad (km/h, 0 = off)"
              value={overspeed}
              onChange={(v) => setOverspeed(Number(v) || 0)}
              min={0}
              max={999}
            />
            <Switch
              label="Activar alarma de vibración"
              checked={vibration}
              onChange={(e) => setVibration(e.currentTarget.checked)}
            />
          </Stack>
        </div>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 7 }}>
        <div className="admin-card">
          <Group justify="space-between" mb="sm">
            <Text fw={700} fz={15}>
              Secuencia de SMS
            </Text>
            {ready && (
              <CopyButton value={allSms}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    variant="light"
                    color={copied ? "green" : "blue"}
                    leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
                    onClick={copy}
                  >
                    {copied ? "Copiado" : "Copiar todo"}
                  </Button>
                )}
              </CopyButton>
            )}
          </Group>

          {!ready ? (
            <Alert color="gray" icon={<Info size={16} />}>
              Completa la IP del servidor y el APN para generar los comandos.
            </Alert>
          ) : (
            <Stack gap={10}>
              <Alert color="yellow" icon={<TriangleAlert size={16} />} p="sm">
                Enviar en orden desde un teléfono al número del SIM del rastreador. Cada comando
                responde <b>SET OK</b>. Los primeros usan la contraseña de fábrica 0000; el paso 5 la
                cambia.
              </Alert>
              {steps.map((s) => (
                <div
                  key={s.n}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "12px 14px",
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Group gap={8} mb={6}>
                        <Badge size="sm" variant="light" color={s.warn ? "yellow" : "blue"} radius="sm">
                          {s.n}
                        </Badge>
                        <Text fz={13} fw={600}>
                          {s.title}
                        </Text>
                      </Group>
                      <Code style={{ fontSize: 14, wordBreak: "break-all" }}>{s.sms}</Code>
                      {s.note && (
                        <Text fz={11} c="dimmed" mt={6}>
                          {s.note}
                        </Text>
                      )}
                    </div>
                    <CopyButton value={s.sms}>
                      {({ copied, copy }) => (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color={copied ? "green" : "gray"}
                          onClick={copy}
                          style={{ flexShrink: 0 }}
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                        </Button>
                      )}
                    </CopyButton>
                  </Group>
                </div>
              ))}
            </Stack>
          )}
        </div>
      </Grid.Col>
    </Grid>
  );
}
