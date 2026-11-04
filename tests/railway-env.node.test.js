import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../ci/validate_railway_build_env.mjs", import.meta.url));
function run(overrides = {}) {
  const env = {
    ...process.env,
    VITE_API_BASE_URL: "https://bible-api.example.org",
    VITE_OIDC_ISSUER: "https://login.example.org/realms/efata",
    VITE_OIDC_CLIENT_ID: "public-browser-app",
    VITE_OIDC_REDIRECT_URI: "https://bible.example.org/auth/callback",
    ...overrides,
  };
  return spawnSync(process.execPath, [checker], { env, encoding: "utf8" });
}
test("Railway Docker build gate accepts complete public HTTPS configuration", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});
test("Railway Docker build gate refuses missing issuer", () => {
  const result = run({ VITE_OIDC_ISSUER: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PUBLIC_BUILD_CONFIG_REQUIRED/);
});
test("Railway Docker build gate refuses insecure public API", () => {
  const result = run({ VITE_API_BASE_URL: "http://api.example.org" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PUBLIC_BUILD_HTTPS_REQUIRED/);
});
test("Railway Docker build gate refuses redirect to wrong callback path", () => {
  const result = run({ VITE_OIDC_REDIRECT_URI: "https://bible.example.org/not-auth" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PUBLIC_BUILD_CALLBACK_PATH_INVALID/);
});
