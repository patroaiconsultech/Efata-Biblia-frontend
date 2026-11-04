// Staging/prod Docker build gate; no credentials read or logged.
// In PR tests the Vite build runs outside Docker, with a mock API.
function required(name) {
  const value = (process.env[name] || "").trim();
  if (!value || /<|>|YOUR_|REPLACE_|example\.test|example\.com/i.test(value)) {
    throw new Error(`PUBLIC_BUILD_CONFIG_REQUIRED:${name}`);
  }
  return value;
}
function httpsUrl(name) {
  const value = required(name);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`PUBLIC_BUILD_URL_INVALID:${name}`); }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`PUBLIC_BUILD_HTTPS_REQUIRED:${name}`);
  }
  if (parsed.hash || parsed.search) throw new Error(`PUBLIC_BUILD_URL_UNEXPECTED_SUFFIX:${name}`);
  return parsed;
}
try {
  const api = httpsUrl("VITE_API_BASE_URL");
  const issuer = httpsUrl("VITE_OIDC_ISSUER");
  const redirect = httpsUrl("VITE_OIDC_REDIRECT_URI");
  required("VITE_OIDC_CLIENT_ID");
  if (redirect.pathname !== "/auth/callback") throw new Error("PUBLIC_BUILD_CALLBACK_PATH_INVALID");
  if (api.origin === issuer.origin) {
    // Allowed, but intentional: sometimes API and identity provider share an origin.
  }
  console.log("BIBLE_APP_PUBLIC_BUILD_CONFIG_OK");
} catch (error) {
  console.error(error.message); // never echo values
  process.exit(1);
}
