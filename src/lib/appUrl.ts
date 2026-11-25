/**
 * Application Base URL & Supabase Auth Callback URL Utilities for NurseGo
 *
 * Resolution priority:
 * 1. Explicit `VITE_APP_URL` environment variable (recommended for production deployments)
 * 2. Active browser origin (`window.location.origin`) in Preview / runtime browser sessions
 *
 * Never hardcodes `localhost:3000`.
 */

export const AUTH_CALLBACK_PATH = '/auth/callback';

export function normalizeBaseUrl(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
}

function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function getAppBaseUrl(): string {
  const browserOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? normalizeBaseUrl(window.location.origin)
      : '';
  const isBrowserNonLocal = Boolean(browserOrigin && !isLocalhostUrl(browserOrigin));

  const envAppUrl = normalizeBaseUrl(
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_APP_URL
  );

  // Never let an accidental localhost VITE_APP_URL override a real Vercel / Preview domain
  if (envAppUrl && !(isBrowserNonLocal && isLocalhostUrl(envAppUrl))) {
    return envAppUrl;
  }

  if (browserOrigin) {
    return browserOrigin;
  }

  return '';
}

export function getAuthCallbackUrl(): string | undefined {
  const base = getAppBaseUrl();
  if (!base) return undefined;
  return `${base}${AUTH_CALLBACK_PATH}`;
}

export function getPatientActivationUrl(token: string, email: string): string {
  const base = getAppBaseUrl();
  const query = `?view=activate&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  return base ? `${base}/${query}` : `/${query}`;
}
