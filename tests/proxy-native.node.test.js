import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

function address(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
async function fetchLocal(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("same-origin API proxy forwards HttpOnly cookie and filters forged identity", async () => {
  const received = [];
  const api = createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    if (req.url === "/api/readiness") {
      res.setHeader("Content-Type", "application/json");
      res.end('{"status":"ready"}'); return;
    }
    res.setHeader("Set-Cookie", "__Host-bible_session=opaque-session; Path=/; HttpOnly; Secure; SameSite=Lax");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end('{"authenticated":true}');
  });
  const upstreamPort = await address(api);
  const probe = createServer();
  const frontPort = await address(probe);
  await new Promise((done) => probe.close(done));
  const root = mkdtempSync(join(tmpdir(), "efata-native-proxy-"));
  const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));
  cpSync(serverPath, join(root, "server.mjs"));
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "index.html"), "<title>EFATA</title>");
  const front = spawn(process.execPath, [join(root, "server.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(frontPort), BIBLE_API_ORIGIN: `http://127.0.0.1:${upstreamPort}` },
    stdio: "ignore",
  });
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { await fetchLocal(frontPort, "/"); break; } catch { await sleep(25); }
    }
    const result = await fetchLocal(frontPort, "/api/auth/login", {
      method: "POST",
      headers: {
        "Origin": "https://bible.example.org", "Content-Type": "application/json",
        "X-Tenant-ID": "another-tenant", "X-Role": "admin",
        "X-CSRF-Token": "token-value", "Cookie": "some=value",
      },
      body: '{"email":"user@example.org","password":"password-example"}',
    });
    assert.equal(result.status, 200);
    assert.match(result.headers["set-cookie"][0], /HttpOnly/);
    assert.equal(received[0].headers["x-tenant-id"], undefined);
    assert.equal(received[0].headers["x-role"], undefined);
    assert.equal(received[0].headers["x-csrf-token"], "token-value");
    assert.equal(received[0].headers.cookie, "some=value");
    assert.equal((await fetchLocal(frontPort, "/api/readiness")).status, 200);
    assert.equal((await fetchLocal(frontPort, "/api/%2e%2e/private")).status, 400);
  } finally {
    front.kill("SIGTERM");
    await new Promise((done) => api.close(done));
    rmSync(root, { recursive: true, force: true });
  }
});
