import { Link } from "react-router-dom";
import {
  BatteryMedium,
  Bell,
  Bike,
  Check,
  Gauge,
  History,
  Instagram,
  LayoutDashboard,
  MapPin,
  PowerOff,
  Route,
  Smartphone,
  User,
} from "lucide-react";
import "../styles/landing.css";

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.004 2C6.486 2 2 6.486 2 12.004c0 2.116.618 4.09 1.686 5.756L2 22l4.36-1.66a9.94 9.94 0 0 0 5.644 1.75h.004c5.518 0 10.004-4.486 10.004-10.004C22.012 6.568 17.526 2.082 12.004 2Zm0 18.184h-.003a8.16 8.16 0 0 1-4.166-1.14l-.298-.177-3.096 1.178.826-3.02-.194-.31a8.14 8.14 0 0 1-1.253-4.347c0-4.508 3.667-8.176 8.184-8.176 2.186 0 4.24.852 5.786 2.398a8.13 8.13 0 0 1 2.396 5.786c0 4.508-3.667 8.176-8.176 8.176Z"
      />
    </svg>
  );
}

const INCLUDES = ["Corte de motor remoto", "Monitoreo en vivo, 24/7", "Web y app móvil"];

const FEATURES = [
  {
    icon: MapPin,
    title: "Monitoreo en vivo",
    text: "Posición, velocidad y rumbo de cada moto actualizados en segundos, sin recargar la página.",
  },
  {
    icon: PowerOff,
    title: "Corte remoto de motor",
    text: "Ante un robo, envía la orden de corte desde la web o la app y confirma el resultado en tiempo real.",
  },
  {
    icon: Bell,
    title: "Alertas instantáneas",
    text: "Emergencia, desplazamiento sin encendido, exceso de velocidad y batería baja te avisan al momento.",
  },
  {
    icon: History,
    title: "Histórico de recorridos",
    text: "Revisa por dónde anduvo cada moto, con distancia, velocidad máxima y paradas del día.",
  },
  {
    icon: Smartphone,
    title: "App móvil con push",
    text: "Todo lo anterior también desde el celular, con notificaciones aunque la app esté cerrada.",
  },
  {
    icon: LayoutDashboard,
    title: "Panel de administración",
    text: "Gestión de dispositivos, clientes y aprovisionamiento de rastreadores en un solo lugar.",
  },
];

const STEPS = [
  {
    title: "Instalamos el rastreador",
    text: "Un técnico instala y configura el GPS y el relé de corte en tu moto.",
  },
  {
    title: "Monitoreas en vivo",
    text: "Entras con tu cuenta desde la web o la app y ves tu moto en el mapa al instante.",
  },
  {
    title: "Actúas si algo pasa",
    text: "Recibes la alerta, ubicas la moto y, si es necesario, cortas el motor a distancia.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="lg-bg" aria-hidden>
        <div className="lg-blob lg-blob--navy" />
        <div className="lg-blob lg-blob--cyan-1" />
        <div className="lg-blob lg-blob--cyan-2" />
        <div className="lg-blob lg-blob--cyan-3" />
      </div>

      <nav className="lg-nav">
        <div className="lg-nav-brand">
          <img src="/logo-mark.png" alt="SentraSecurity" />
          <span className="lg-nav-brand-text">SentraSecurity</span>
        </div>
        <div className="lg-nav-links">
          <a href="#plataforma">Plataforma</a>
          <a href="#como-funciona">Cómo funciona</a>
        </div>
        <Link to="/login" className="lg-btn lg-btn--primary">
          Iniciar sesión
        </Link>
      </nav>

      <header className="lg-section lg-hero">
        <div>
          <h1 className="lg-h1">
            Tu moto, siempre <span className="lg-h1-highlight">a la vista</span>.
          </h1>
          <p className="lg-lead">
            SentraSecurity monitorea tu moto en tiempo real y te deja cortar el motor a
            distancia si te la roban. Web y app móvil, alertas al instante.
          </p>
          <div className="lg-hero-actions">
            <Link to="/login" className="lg-btn lg-btn--primary">
              Iniciar sesión
            </Link>
            <a href="#plataforma" className="lg-btn lg-btn--ghost">
              Conoce la plataforma
            </a>
          </div>
          <ul className="lg-hero-includes">
            {INCLUDES.map((item) => (
              <li key={item}>
                <span className="lg-check">
                  <Check size={13} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg-hero-visual lg-glass lg-mock" aria-hidden>
          <div className="lg-mock-screen">
            <div className="lg-mock-grid" />
            <svg className="lg-mock-route" viewBox="0 0 300 340" fill="none">
              <path
                id="lg-route-d"
                d="M40 60 C 90 90, 70 140, 130 160 S 220 180, 200 240 S 150 300, 190 320"
                stroke="rgba(0,253,252,0.28)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="1 14"
              />
              <path
                className="lg-mock-route-progress"
                d="M40 60 C 90 90, 70 140, 130 160 S 220 180, 200 240 S 150 300, 190 320"
                stroke="#00fdfc"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle className="lg-mock-marker-ring" r="7" fill="none" stroke="#00fdfc" strokeWidth="2" />
              <circle className="lg-mock-marker" r="6" fill="#00fdfc" />
            </svg>
            <div className="lg-mock-card lg-glass lg-glass--strong" style={{ boxShadow: "none" }}>
              <div className="lg-mock-card-head">
                <span className="lg-dot" />
                <div>
                  <b>Moto de Carlos</b>
                  <span>En movimiento</span>
                </div>
              </div>
              <div className="lg-mock-card-stats">
                <span>
                  <Gauge size={13} /> 38 km/h
                </span>
                <span>
                  <BatteryMedium size={13} /> 82%
                </span>
                <span>
                  <Route size={13} /> 4.2 km
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="plataforma" className="lg-section">
        <div className="lg-center" style={{ maxWidth: 640 }}>
          <span className="lg-eyebrow">Plataforma</span>
          <h2 className="lg-h2">Todo lo que necesitas para cuidar tu flota</h2>
          <p className="lg-lead" style={{ marginInline: "auto" }}>
            Un solo sistema propio: ingesta GPS, comandos al dispositivo y notificaciones,
            sin depender de terceros.
          </p>
        </div>
        <div className="lg-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lg-card">
              <div className="lg-card-icon">
                <f.icon size={20} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lg-section">
        <div className="lg-app-section">
          <div>
            <span className="lg-eyebrow">App móvil</span>
            <h2 className="lg-h2">Todo el control, desde el bolsillo</h2>
            <p className="lg-lead">
              La misma plataforma en tu celular: mapa en vivo, alertas push y corte de
              motor con un botón, sin depender de la web.
            </p>
            <ul className="lg-hero-includes">
              <li>
                <span className="lg-check">
                  <Check size={13} />
                </span>
                Mapa en vivo y notificaciones push
              </li>
              <li>
                <span className="lg-check">
                  <Check size={13} />
                </span>
                Corte y restauración de motor con confirmación
              </li>
              <li>
                <span className="lg-check">
                  <Check size={13} />
                </span>
                Historial de recorridos y alertas
              </li>
            </ul>
          </div>

          <div className="lg-phone-wrap" aria-hidden>
            <div className="lg-phone">
              <div className="lg-phone-notch" />
              <div className="lg-phone-screen">
                <div className="lg-phone-header">
                  <div>
                    <b>Moto de Carlos</b>
                    <span>ABC-123 · En línea</span>
                  </div>
                  <span className="lg-dot" />
                </div>
                <div className="lg-phone-map">
                  <div className="lg-phone-map-grid" />
                  <span className="lg-phone-map-pin">
                    <MapPin size={16} />
                  </span>
                </div>
                <div className="lg-phone-stats">
                  <div>
                    <Gauge size={14} />
                    <b>0</b>
                    <small>km/h</small>
                  </div>
                  <div>
                    <BatteryMedium size={14} />
                    <b>82%</b>
                    <small>Batería</small>
                  </div>
                  <div>
                    <Route size={14} />
                    <b>12.4</b>
                    <small>km hoy</small>
                  </div>
                </div>
                <div className="lg-phone-cut-btn">
                  <PowerOff size={16} />
                  Cortar motor
                </div>
                <p className="lg-phone-cut-hint">Se pedirá confirmación antes de ejecutar</p>
                <div className="lg-phone-tabbar">
                  <span className="active">
                    <Bike size={16} />
                    Motos
                  </span>
                  <span>
                    <MapPin size={16} />
                    Mapa
                  </span>
                  <span>
                    <Bell size={16} />
                    Alertas
                  </span>
                  <span>
                    <User size={16} />
                    Perfil
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="lg-section">
        <div className="lg-center" style={{ maxWidth: 560 }}>
          <span className="lg-eyebrow">Cómo funciona</span>
          <h2 className="lg-h2">De la instalación a la tranquilidad</h2>
        </div>
        <div className="lg-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="lg-step lg-glass">
              <div className="lg-step-num">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lg-section">
        <div className="lg-cta lg-glass lg-glass--strong">
          <span className="lg-eyebrow">Empieza hoy</span>
          <h2 className="lg-h2">¿Listo para proteger tu moto?</h2>
          <p className="lg-lead lg-center" style={{ marginInline: "auto" }}>
            Contacta a SentraSecurity para activar tu servicio, o ingresa si ya eres
            cliente.
          </p>
          <div className="lg-hero-actions" style={{ justifyContent: "center" }}>
            <Link to="/login" className="lg-btn lg-btn--primary">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </section>

      <footer className="lg-footer">
        <div className="lg-footer-inner">
          <div className="lg-footer-col lg-footer-col--brand">
            <div className="lg-footer-brand">
              <img src="/logo-mark.png" alt="SentraSecurity" />
              <span>SentraSecurity</span>
            </div>
            <p>Monitoreo GPS y corte remoto de motor para motos, en Cartagena de Indias.</p>
            <p className="lg-footer-partner">
              En colaboración con <b>Sentra Labs</b>
            </p>
            <div className="lg-footer-social">
              <a
                href="https://www.instagram.com/sentralabs.co/"
                target="_blank"
                rel="noreferrer"
                className="lg-footer-social--instagram"
                aria-label="Instagram"
              >
                <Instagram size={18} />
              </a>
              <a href="#" className="lg-footer-social--whatsapp" aria-label="WhatsApp">
                <WhatsAppIcon size={18} />
              </a>
            </div>
          </div>
          <div className="lg-footer-col">
            <h4>Producto</h4>
            <a href="#plataforma">Plataforma</a>
            <a href="#como-funciona">Cómo funciona</a>
            <Link to="/login">Iniciar sesión</Link>
          </div>
          <div className="lg-footer-col">
            <h4>Contacto</h4>
            <a href="mailto:contacto@sentrasecurity.co">contacto@sentrasecurity.co</a>
            <span>Cartagena de Indias, Colombia</span>
          </div>
          <div className="lg-footer-col">
            <h4>Legal</h4>
            <a href="#">Política de privacidad</a>
            <a href="#">Términos y condiciones</a>
          </div>
        </div>
        <p className="lg-footer-legal">
          © {new Date().getFullYear()} SentraSecurity · Monitoreo GPS · Cartagena de Indias
        </p>
      </footer>
    </div>
  );
}
