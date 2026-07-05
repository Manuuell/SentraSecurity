import { LegalLayout } from "../components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Términos y condiciones" updated="5 de julio de 2026">
      <h2>1. El servicio</h2>
      <p>
        SentraSecurity ofrece monitoreo GPS en tiempo real y corte remoto de motor para motos,
        mediante un rastreador instalado en el vehículo y acceso a la plataforma web y móvil. El
        servicio se presta según el plan contratado con SentraSecurity.
      </p>

      <h2>2. Responsabilidades del cliente</h2>
      <ul>
        <li>Mantener el rastreador y el relé de corte correctamente instalados y alimentados.</li>
        <li>Proveer datos de cuenta veraces y mantener actualizado el número de SIM del equipo.</li>
        <li>Usar la función de corte de motor de forma responsable y solo sobre tu propio vehículo.</li>
      </ul>

      <h2>3. Limitación de responsabilidad</h2>
      <p>
        El corte remoto de motor depende de la cobertura de red del operador móvil y, en algunos
        casos, del envío de comandos por SMS. SentraSecurity no puede garantizar la ejecución
        instantánea del corte en todos los escenarios (por ejemplo, sin señal o con el equipo
        apagado), ni garantiza la recuperación del vehículo en caso de robo. El servicio es una
        herramienta de apoyo a la seguridad, no un seguro ni una garantía de recuperación.
      </p>

      <h2>4. Planes y pagos</h2>
      <p>
        Las condiciones comerciales (tarifas, periodicidad, medios de pago) son las acordadas en
        el plan contratado. El impago prolongado puede resultar en la suspensión del servicio.
      </p>

      <h2>5. Cancelación</h2>
      <p>
        Puedes solicitar la cancelación del servicio en cualquier momento escribiendo a{" "}
        <a href="mailto:contacto@sentrasecurity.co">contacto@sentrasecurity.co</a>. La
        desinstalación física del equipo, si aplica, se coordina por separado.
      </p>

      <h2>6. Cambios en estos términos</h2>
      <p>
        Podemos actualizar estos términos ocasionalmente. Los cambios relevantes se notificarán a
        través de la plataforma o por correo.
      </p>

      <h2>7. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de Colombia. Cualquier controversia se someterá a
        los jueces competentes de Cartagena de Indias.
      </p>

      <h2>8. Contacto</h2>
      <p>
        Para cualquier duda sobre estos términos, escríbenos a{" "}
        <a href="mailto:contacto@sentrasecurity.co">contacto@sentrasecurity.co</a>.
      </p>
    </LegalLayout>
  );
}
