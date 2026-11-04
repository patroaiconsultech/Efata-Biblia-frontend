// Bible native-session API client. No browser-selected identity or stored tokens.
// All authenticated requests travel through the same-origin /api proxy.
const API_BASE_URL = "";
let csrfToken = null;

function requestId() {
  if (globalThis.crypto?.randomUUID) return `web_${globalThis.crypto.randomUUID()}`;
  return `web_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function setCsrfToken(value) {
  csrfToken = typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function apiHeaders(extra = {}, method = "GET") {
  const headers = { Accept: "application/json", "X-Request-ID": requestId(), ...extra };
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  return headers;
}

export async function apiFetch(path, options = {}) {
  if (typeof path !== "string" || !path.startsWith("/api/") || path.startsWith("//")) {
    throw new Error("BIBLE_API_PATH_INVALID");
  }
  const method = (options.method || "GET").toUpperCase();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "same-origin",
    headers: apiHeaders(options.headers || {}, method),
    cache: options.cache || "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.detail?.message || body?.message || `API error ${response.status}`);
    error.code = body?.detail?.code || body?.code || "API_ERROR";
    error.status = response.status;
    error.requestId = response.headers.get("X-Request-ID");
    if (response.status === 401) setCsrfToken(null);
    throw error;
  }
  return body;
}

export const api = {
  authStatus: () => apiFetch("/api/auth/status"),
  authSession: async () => {
    const context = await apiFetch("/api/auth/session");
    setCsrfToken(context.csrf_token);
    return context;
  },
  login: async (email, password) => {
    const context = await apiFetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setCsrfToken(context.csrf_token);
    return context;
  },
  register: (email, password) => apiFetch("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }),
  logout: async () => {
    try { return await apiFetch("/api/auth/logout", { method: "POST" }); }
    finally { setCsrfToken(null); }
  },
  resetRequest: (email) => apiFetch("/api/auth/password-reset/request", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }),
  resetConfirm: (token, password) => apiFetch("/api/auth/password-reset/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  }),
  health: () => apiFetch("/api/health"),
  adminOverview: () => apiFetch("/api/admin/overview", { cache: "no-store" }),
  faithPreference: () => apiFetch("/api/faith-preferences/me"),
  saveFaithPreference: (tradition, study_style) => apiFetch("/api/faith-preferences/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tradition, study_style, consent: true, consent_version: "faith-preferences-v1" }),
  }),
  deleteFaithPreference: () => apiFetch("/api/faith-preferences/me", { method: "DELETE" }),
  billingPlans: () => apiFetch("/api/billing/plans"),
  billingMe: () => apiFetch("/api/billing/me"),
  createSandboxCheckout: (plan_code, idempotency_key) => apiFetch("/api/billing/checkouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code, idempotency_key }),
  }),
  authContext: (signal) => apiFetch("/api/auth/me", { signal }),
  readiness: () => apiFetch("/api/readiness"),
  works: () => apiFetch("/api/works"),
  canons: () => apiFetch("/api/canons"),
  translations: () => apiFetch("/api/translations"),
  chapter: (workId, chapter) => apiFetch(`/api/works/${encodeURIComponent(workId)}/chapters/${chapter}`),
  search: (query) => apiFetch(`/api/search?q=${encodeURIComponent(query)}`),
  progress: () => apiFetch("/api/progress"),
  saveProgress: (textUnitId, completed) => apiFetch(`/api/progress/${encodeURIComponent(textUnitId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed }) }),
  today: () => apiFetch("/api/journeys/today"),
  bookmarks: () => apiFetch("/api/bookmarks"),
  setBookmark: (textUnitId, active) => apiFetch(`/api/bookmarks/${encodeURIComponent(textUnitId)}?active=${active}`, { method: "PUT" }),
  highlights: () => apiFetch("/api/highlights"),
  createHighlight: (textUnitId, note = "", color = "gold") => apiFetch("/api/highlights", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text_unit_id: textUnitId, note, color }),
  }),
  deleteHighlight: (highlightId) => apiFetch(`/api/highlights/${encodeURIComponent(highlightId)}`, { method: "DELETE" }),
  journal: () => apiFetch("/api/journal"),
  createJournal: (content, kind = "journal") => apiFetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, kind }) }),
  deleteJournal: (entryId) => apiFetch(`/api/journal/${encodeURIComponent(entryId)}`, { method: "DELETE" }),
};

export function apiBaseUrl() {
  return API_BASE_URL || "(mesma origem)";
}
