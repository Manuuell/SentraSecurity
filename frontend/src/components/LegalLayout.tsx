import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "../styles/landing.css";

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="landing">
      <div className="lg-bg" aria-hidden>
        <div className="lg-blob lg-blob--navy" />
        <div className="lg-blob lg-blob--cyan-1" />
        <div className="lg-blob lg-blob--cyan-2" />
        <div className="lg-blob lg-blob--cyan-3" />
      </div>

      <nav className="lg-nav">
        <Link to="/" className="lg-nav-brand">
          <img src="/logo-mark.png" alt="SentraSecurity" />
          <span className="lg-nav-brand-text">SentraSecurity</span>
        </Link>
        <Link to="/" className="lg-btn lg-btn--ghost">
          Volver al inicio
        </Link>
      </nav>

      <section className="lg-section lg-legal">
        <h1 className="lg-h2">{title}</h1>
        <p className="lg-legal-updated">Última actualización: {updated}</p>
        <div className="lg-legal-body">{children}</div>
        <p className="lg-legal-note">
          Este documento es una plantilla genérica de referencia y no ha sido revisado por un
          abogado. Antes de considerarlo definitivo, se recomienda validarlo con asesoría legal
          calificada en Colombia.
        </p>
      </section>

      <footer className="lg-footer">
        <p className="lg-footer-legal">
          © {new Date().getFullYear()} SentraSecurity · Monitoreo GPS · Cartagena de Indias
        </p>
      </footer>
    </div>
  );
}
