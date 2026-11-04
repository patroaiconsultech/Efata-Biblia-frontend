// Native-session deployment: Vite bundle must not contain API endpoints or OIDC.
try {
  for (const name of ["VITE_API_BASE_URL", "VITE_OIDC_ISSUER", "VITE_OIDC_CLIENT_ID", "VITE_OIDC_REDIRECT_URI",
                     "VITE_DEMO_TENANT_ID", "VITE_DEMO_USER_ID", "VITE_DEMO_ADMIN_ENABLED"]) {
    if ((process.env[name] || "").trim()) throw new Error(`BIBLE_LEGACY_BROWSER_IDENTITY_FORBIDDEN:${name}`);
  }
  const sha = (process.env.VITE_BUILD_SHA || "").trim();
  if (sha && sha !== "UNPINNED" && !/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new Error("BIBLE_BUILD_SHA_INVALID");
  }
  console.log("BIBLE_NATIVE_SAME_ORIGIN_BUILD_CONFIG_OK");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
