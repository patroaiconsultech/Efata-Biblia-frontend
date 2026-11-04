import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const here = dirname(fileURLToPath(import.meta.url));

async function chooseFreePort() {
  const listener = createNetServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("malformed percent encoding returns 400 without crashing the static server", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "efata-static-server-"));
  const port = await chooseFreePort();
  const source = join(here, "..", "server.mjs");
  cpSync(source, join(temporary, "server.mjs"));
  mkdirSync(join(temporary, "dist"));
  writeFileSync(join(temporary, "dist", "index.html"), "<title>EFATA SMOKE</title>");

  const processHandle = spawn(process.execPath, [join(temporary, "server.mjs")], {
    cwd: temporary,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  try {
    let initial;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (processHandle.exitCode !== null) throw new Error("Static server exited during startup");
      try {
        initial = await request(port, "/");
        break;
      } catch {
        await sleep(25);
      }
    }
    assert.equal(initial?.status, 200, "Static server should become healthy");
    for (const badPath of ["/%ZZ", "/%E0%A4%A"]) {
      const malformed = await request(port, badPath);
      assert.equal(malformed.status, 400, "Malformed URI must be rejected");
      assert.equal(malformed.body, "Bad request");
    }

    const after = await request(port, "/");
    assert.equal(after.status, 200, "Static server must stay available after malformed URI");
    assert.equal(processHandle.exitCode, null);
  } finally {
    processHandle.kill("SIGTERM");
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("public landing serves static SEO and keeps app/private routes noindex", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "efata-landing-server-"));
  const port = await chooseFreePort();
  cpSync(join(here, "..", "server.mjs"), join(temporary, "server.mjs"));
  mkdirSync(join(temporary, "dist", "app"), { recursive: true });
  writeFileSync(join(temporary, "dist", "index.html"), "<title>LANDING EfaTÀ 777</title>");
  writeFileSync(join(temporary, "dist", "app", "index.html"), '<meta name="robots" content="noindex">');
  writeFileSync(join(temporary, "dist", "robots.txt"), "Disallow: /app/");
  const server = spawn(process.execPath, [join(temporary, "server.mjs")], {
    cwd: temporary, env: { ...process.env, PORT: String(port) }, stdio: "ignore",
  });
  try {
    for (let tries = 0; tries < 80; tries += 1) {
      try { await request(port, "/"); break; } catch { await sleep(25); }
    }
    assert.match((await request(port, "/")).body, /LANDING/);
    assert.match((await request(port, "/")).headers["x-robots-tag"] || "", /noindex/, "Indexing must be disabled by default");
    assert.match((await request(port, "/app/")).body, /noindex/);
    assert.match((await request(port, "/app/")).headers["x-robots-tag"] || "", /noindex/);
    assert.equal((await request(port, "/auth/callback")).status, 404);
    assert.match((await request(port, "/robots.txt")).body, /Disallow/);
    assert.equal((await request(port, "/desconhecido")).status, 404, "Unknown SEO URLs must not become soft-200 pages");
  } finally {
    server.kill("SIGTERM");
    rmSync(temporary, { recursive: true, force: true });
  }
});


test("browser CSP permits same-origin API and forbids external OIDC/API", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "efata-native-csp-"));
  const port = await chooseFreePort();
  cpSync(join(here, "..", "server.mjs"), join(temporary, "server.mjs"));
  mkdirSync(join(temporary, "dist"), { recursive: true });
  writeFileSync(join(temporary, "dist", "index.html"), "<title>Native session CSP</title>");
  const server = spawn(process.execPath, [join(temporary, "server.mjs")], {
    cwd: temporary, env: { ...process.env, PORT: String(port) }, stdio: "ignore",
  });
  try {
    let response;
    for (let tries = 0; tries < 80; tries++) {
      try { response = await request(port, "/"); break; } catch { await sleep(25); }
    }
    assert.equal(response?.status, 200);
    const csp = response.headers["content-security-policy"];
    assert.match(csp, /connect-src 'self';/);
    assert.doesNotMatch(csp, /oidc|https:/);
    assert.equal((await request(port, "/api/auth/session")).status, 503);
  } finally {
    server.kill("SIGTERM");
    rmSync(temporary, { recursive: true, force: true });
  }
});
