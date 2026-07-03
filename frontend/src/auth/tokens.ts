/**
 * El access token vive SOLO en memoria (nunca en localStorage): un XSS no
 * puede exfiltrar lo que no está persistido. La sesión sobrevive recargas
 * gracias al refresh token en cookie httpOnly (path /api/auth).
 */

let accessToken: string | null = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** El interceptor lo emite cuando el refresh definitivo falla: sesión muerta. */
export const SESSION_EXPIRED_EVENT = "sentra:session-expired";

export function emitSessionExpired() {
  setAccessToken(null);
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
