const issuer = (import.meta.env.VITE_OIDC_ISSUER || "").replace(/\/$/, "");
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID || "";
const redirectUri = import.meta.env.VITE_OIDC_REDIRECT_URI || `${window.location.origin}/auth/callback`;

function randomString(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function base64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function oidcConfigured() {
  return Boolean(issuer && clientId);
}

export function isOidcCallback() {
  const callbackPath = new URL(redirectUri, window.location.origin).pathname;
  return window.location.pathname === callbackPath;
}

export async function beginLogin() {
  if (!oidcConfigured()) throw new Error("OIDC_NOT_CONFIGURED");
  const state = randomString();
  const nonce = randomString();
  const verifier = randomString(48);
  const challenge = base64Url(await sha256(verifier));
  sessionStorage.setItem("bible_oidc_state", state);
  sessionStorage.setItem("bible_oidc_nonce", nonce);
  sessionStorage.setItem("bible_oidc_verifier", verifier);
  const url = new URL(`${issuer}/authorize`);
  url.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256" });
  window.location.assign(url.toString());
}

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const expectedState = sessionStorage.getItem("bible_oidc_state");
  const state = params.get("state");
  const code = params.get("code");
  if (params.get("error")) throw new Error(`OIDC_${params.get("error")}`);
  if (!code || !state || state !== expectedState) throw new Error("OIDC_STATE_INVALID");
  const verifier = sessionStorage.getItem("bible_oidc_verifier");
  if (!verifier) throw new Error("OIDC_VERIFIER_MISSING");
  const response = await fetch(`${issuer}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirectUri, code, code_verifier: verifier }) });
  if (!response.ok) throw new Error("OIDC_TOKEN_EXCHANGE_FAILED");
  const payload = await response.json();
  if (!payload.access_token) throw new Error("OIDC_ACCESS_TOKEN_MISSING");
  sessionStorage.setItem("bible_access_token", payload.access_token);
  sessionStorage.removeItem("bible_oidc_state");
  sessionStorage.removeItem("bible_oidc_nonce");
  sessionStorage.removeItem("bible_oidc_verifier");
  window.history.replaceState({}, document.title, "/app/");
  return payload;
}

export function clearSession() {
  sessionStorage.removeItem("bible_access_token");
  sessionStorage.removeItem("bible_oidc_state");
  sessionStorage.removeItem("bible_oidc_nonce");
  sessionStorage.removeItem("bible_oidc_verifier");
}

export function hasToken() {
  return Boolean(sessionStorage.getItem("bible_access_token"));
}
