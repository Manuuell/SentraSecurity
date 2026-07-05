import { LegalLayout } from "../components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad" updated="5 de julio de 2026">
      <h2>1. Qué datos recopilamos</h2>
      <p>
        Para prestar el servicio de monitoreo recopilamos: datos de tu cuenta (nombre, correo,
        teléfono), datos del vehículo (ubicación GPS, velocidad, rumbo, nivel de batería del
        rastreador, estado del motor) y registros de las acciones que realizas en la plataforma
        (por ejemplo, órdenes de corte o restauración de motor). La app móvil no accede a la
        ubicación de tu teléfono: solo muestra la posición reportada por el rastreador instalado
        en tu moto.
      </p>

      <h2>2. Para qué usamos tus datos</h2>
      <ul>
        <li>Mostrar la posición e historial de recorridos de tu vehículo en tiempo real.</li>
        <li>Enviarte alertas (emergencia, desplazamiento sin encendido, batería baja, etc.).</li>
        <li>Ejecutar y confirmar órdenes de corte o restauración de motor que tú solicites.</li>
        <li>Brindarte soporte técnico y darte acceso a tu cuenta.</li>
      </ul>

      <h2>3. Con quién compartimos datos</h2>
      <p>
        No vendemos ni alquilamos tus datos a terceros. Solo los compartimos con proveedores de
        infraestructura estrictamente necesarios para operar el servicio (hosting, envío de SMS al
        rastreador, notificaciones push), y únicamente en la medida necesaria para prestar el
        servicio.
      </p>

      <h2>4. Cómo protegemos tus datos</h2>
      <p>
        Las contraseñas se almacenan cifradas, las sesiones usan tokens con expiración, y el
        acceso a los datos de cada cliente está restringido por rol: un cliente solo puede ver los
        vehículos asignados a su cuenta.
      </p>

      <h2>5. Cuánto tiempo conservamos los datos</h2>
      <p>
        Las posiciones GPS crudas se conservan por 6 meses; los eventos y alarmas se conservan de
        forma indefinida como historial de seguridad de tu cuenta, salvo que solicites su
        eliminación.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        De acuerdo con la Ley 1581 de 2012 de Colombia (protección de datos personales), puedes
        solicitar en cualquier momento acceder, actualizar, corregir o eliminar tus datos
        personales, así como revocar tu autorización para tratarlos, escribiendo a{" "}
        <a href="mailto:contacto@sentrasecurity.co">contacto@sentrasecurity.co</a>.
      </p>

      <h2>7. Contacto</h2>
      <p>
        Si tienes preguntas sobre esta política, escríbenos a{" "}
        <a href="mailto:contacto@sentrasecurity.co">contacto@sentrasecurity.co</a>.
      </p>
    </LegalLayout>
  );
}
