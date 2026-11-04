import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../ci/validate_railway_build_env.mjs", import.meta.url));
function run(overrides = {}) {
  const env = { ...process.env };
  for (const name of ["VITE_API_BASE_URL", "VITE_OIDC_ISSUER", "VITE_OIDC_CLIENT_ID",
                       "VITE_OIDC_REDIRECT_URI", "VITE_DEMO_TENANT_ID", "VITE_DEMO_USER_ID",
                       "VITE_DEMO_ADMIN_ENABLED"]) delete env[name];
  return spawnSync(process.execPath, [checker], { env: { ...env, ...overrides }, encoding: "utf8" });
}
test("native same-origin Vite build accepts no provider variables", () => {
  assert.equal(run().status, 0);
});
test("rejects OIDC browser identity", () => {
  const result = run({ VITE_OIDC_ISSUER: "https://oidc.example.org" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BIBLE_LEGACY_BROWSER_IDENTITY_FORBIDDEN/);
});
test("rejects external API URL", () => {
  const result = run({ VITE_API_BASE_URL: "https://api.example.org" });
  assert.notEqual(result.status, 0);
});
test("rejects browser tenant impersonation", () => {
  const result = run({ VITE_DEMO_ADMIN_ENABLED: "true" });
  assert.notEqual(result.status, 0);
});
