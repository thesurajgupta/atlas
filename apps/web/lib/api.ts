/**
 * Client for the ATLAS API.
 *
 * Tokens live in `sessionStorage`, not `localStorage`: an access token is a
 * bearer credential for case data, and `localStorage` survives the browser
 * being closed and is readable by any script on the origin. Session storage is
 * cleared with the tab, which is the right lifetime for an investigator
 * console. Neither is where this belongs in production — an httpOnly cookie
 * set by the API is — but that needs a same-site deployment, and this is a
 * development client talking to localhost.
 */

const API_BASE = process.env.NEXT_PUBLIC_ATLAS_API ?? "http://localhost:8000";

const ACCESS_KEY = "atlas.access_token";
const REFRESH_KEY = "atlas.refresh_token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly correlationId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Private mode, or site data blocked. Treat it as signed out rather than
    // crashing the page.
    return null;
  }
}

function writeToken(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the session simply will not persist a reload */
  }
}

export const auth = {
  accessToken: () => readToken(ACCESS_KEY),
  isSignedIn: () => readToken(ACCESS_KEY) !== null,
  clear: () => {
    writeToken(ACCESS_KEY, null);
    writeToken(REFRESH_KEY, null);
  },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken(ACCESS_KEY);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    // A network-level failure here is almost always the API not running, so
    // say that rather than surfacing "Failed to fetch".
    throw new ApiError(0, `Cannot reach the ATLAS API at ${API_BASE}. Is it running?`);
  }

  const correlationId = response.headers.get("X-Correlation-Id");

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : response.statusText;
    throw new ApiError(response.status, detail, correlationId);
  }

  return body as T;
}

/* ------------------------------------------------------------------ auth */

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: string;
  jurisdiction_id: string;
  mfa_enrolled: boolean;
}

export async function login(
  username: string,
  password: string,
  totpCode: string,
): Promise<Profile> {
  const result = await request<LoginResult>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username,
      password,
      totp_code: totpCode.trim() === "" ? null : totpCode.trim(),
    }),
  });
  writeToken(ACCESS_KEY, result.access_token);
  writeToken(REFRESH_KEY, result.refresh_token);
  return getProfile();
}

export function getProfile(): Promise<Profile> {
  return request<Profile>("/api/v1/auth/me");
}

export async function logout(): Promise<void> {
  try {
    await request("/api/v1/auth/logout", { method: "POST" });
  } finally {
    // Clear locally even if the call failed — a token the server still knows
    // about is better than a client that thinks it is signed in when it is not.
    auth.clear();
  }
}

/* -------------------------------------------------------------- resources */

export interface ApiCase {
  id: string;
  public_ref: string;
  title: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  owning_jurisdiction_id: string;
  assigned_to_id: string | null;
  amount_at_risk: string | null;
  complaint_count: number;
  golden_hour_minutes_elapsed: number | null;
}

export interface ApiComplaint {
  id: string;
  public_ref: string;
  reported_at: string;
  fraud_initiated_at: string | null;
  observed_at: string;
  typology: string;
  reported_amount: string;
  currency: string;
  victim_jurisdiction_id: string | null;
  is_synthetic: boolean;
  golden_hour_minutes_elapsed: number | null;
}

export interface ApiEndpoint {
  id: string;
  public_ref: string;
  channel: string;
  operator: string;
  jurisdiction_id: string | null;
  h3_r8: string | null;
  lat: number | null;
  lon: number | null;
  is_geolocatable: boolean;
}

interface Listed<T> {
  items: T[];
  total: number;
}

export const listCases = () => request<Listed<ApiCase>>("/api/v1/cases?limit=50");
export const listComplaints = () =>
  request<Listed<ApiComplaint>>("/api/v1/complaints?limit=50");
export const listEndpoints = () =>
  request<Listed<ApiEndpoint>>("/api/v1/geo/endpoints?limit=200");
