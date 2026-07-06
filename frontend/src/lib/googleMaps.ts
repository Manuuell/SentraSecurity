declare global {
  interface Window {
    /** Hook documentado de Google: se llama cuando la key falla por auth
     * (no activada, sin billing, referrer no permitido, etc.) — a diferencia
     * de un script error, esto pasa DESPUÉS de que el script ya cargó bien. */
    gm_authFailure?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;

/** Carga el script de Google Maps JS una sola vez (cacheado entre componentes). */
export function loadGoogleMaps(): Promise<void> {
  if (typeof google !== "undefined" && google.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
  if (!key) return Promise.reject(new Error("VITE_GOOGLE_MAPS_KEY no configurada"));

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("No se pudo cargar Google Maps"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
