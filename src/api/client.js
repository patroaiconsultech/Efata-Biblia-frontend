const viteEnv = import.meta.env || {};
const API_BASE_URL = (viteEnv.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const isLocal = (viteEnv.MODE || "development") !== "production";

function requestId() {
  if (globalThis.crypto?.randomUUID) return `web_${globalThis.crypto.randomUUID()}`;
  return `web_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function apiHeaders(extra = {}) {
  const headers = { Accept: "application/json", "X-Request-ID": requestId(), ...extra };
  if (isLocal) {
    headers["X-Tenant-ID"] = viteEnv.VITE_DEMO_TENANT_ID || "tenant-demo";
    headers["X-User-ID"] = viteEnv.VITE_DEMO_USER_ID || "user-demo";
    headers["X-Role"] = viteEnv.VITE_DEMO_ADMIN_ENABLED === "true" ? "admin" : "member";
  }
  const token = globalThis.sessionStorage?.getItem("bible_access_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: apiHeaders(options.headers || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.detail?.message || body?.message || `API error ${response.status}`);
    error.code = body?.detail?.code || body?.code || "API_ERROR";
    error.status = response.status;
    error.requestId = response.headers.get("X-Request-ID");
    throw error;
  }
  return body;
}

export const api = {
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
  return API_BASE_URL;
}
