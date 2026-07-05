import { Link } from "react-router-dom";
import {
  BatteryMedium,
  Bell,
  Check,
  Gauge,
  History,
  LayoutDashboard,
  MapPin,
  PowerOff,
  Route,
  Smartphone,
} from "lucide-react";
import "../styles/landing.css";

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
            <div key={f.title} className="lg-card lg-glass">
              <div className="lg-card-icon">
                <f.icon size={20} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
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
          <div className="lg-footer-brand">
            <img src="/logo-mark.png" alt="SentraSecurity" />
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>SentraSecurity</span>
            <span className="lg-footer-divider" aria-hidden />
            <span className="lg-footer-partner">
              En colaboración con <b>Sentra Labs</b>
            </span>
          </div>
          <p className="lg-footer-legal">
            © {new Date().getFullYear()} SentraSecurity · Monitoreo GPS · Cartagena de
            Indias
          </p>
        </div>
      </footer>
    </div>
  );
}
