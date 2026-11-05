import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const docker = read("../Dockerfile");
const landing = read("../index.html");

test("Vite 8 declares the landing and app as separate HTML inputs", () => {
  const source = read("../vite.config.js");
  assert.ok(source.includes("input: {"));
  assert.ok(source.includes('resolve(import.meta.dirname, "index.html")'));
  assert.ok(source.includes('resolve(import.meta.dirname, "app/index.html")'));
  assert.ok(!source.includes("rollupOptions:"));
});

test("development proxy still forwards relative /api requests", () => {
  const source = read("../vite.config.js");
  assert.ok(source.includes("BIBLE_API_ORIGIN"));
  assert.ok(source.includes('"/api"'));
});

test("static landing references only assets from public/, not a module bundler entry", () => {
  assert.match(landing, /href=["']\/landing\.css["']/);
  assert.match(landing, /src=["']\/landing\.js["']/);
  assert.doesNotMatch(landing, /<script[^>]+type=["']module["']/i);
});

test("Docker restores missing static landing and keeps all post-build integrity checks", () => {
  assert.ok(docker.includes("if [ ! -s dist/index.html ]; then cp index.html dist/index.html; fi"));
  for (const file of ["dist/index.html", "dist/app/index.html", "dist/landing.css", "dist/landing.js"]) {
    assert.ok(docker.includes(`test -s ${file}`), `missing validation: ${file}`);
  }
});

test("post-build shell repairs missing landing without touching app or already-generated HTML", () => {
  // Exercise only the shell fragment after npm run build, not a mock Vite build.
  const command = docker.replace(/\\\n\s*/g, " ").match(
    /if \[ ! -s dist\/index\.html \]; then cp index\.html dist\/index\.html; fi &&\s*test -s dist\/index\.html &&\s*test -s dist\/app\/index\.html &&\s*test -s dist\/landing\.css &&\s*test -s dist\/landing\.js/
  )?.[0];
  assert.ok(command, "post-build command must be present");

  const dir = mkdtempSync(join(tmpdir(), "efata-landing-"));
  try {
    mkdirSync(join(dir, "dist/app"), { recursive: true });
    writeFileSync(join(dir, "index.html"), landing);
    writeFileSync(join(dir, "dist/app/index.html"), "<html>reader</html>");
    writeFileSync(join(dir, "dist/landing.css"), "body { color: black; }");
    writeFileSync(join(dir, "dist/landing.js"), "console.log('ok')");
    execFileSync("sh", ["-c", command], { cwd: dir });
    assert.equal(readFileSync(join(dir, "dist/index.html"), "utf8"), landing);
    assert.equal(readFileSync(join(dir, "dist/app/index.html"), "utf8"), "<html>reader</html>");
    writeFileSync(join(dir, "dist/index.html"), "<html>built version</html>");
    execFileSync("sh", ["-c", command], { cwd: dir });
    assert.equal(readFileSync(join(dir, "dist/index.html"), "utf8"), "<html>built version</html>");

    rmSync(join(dir, "dist/landing.js"));
    assert.throws(() => execFileSync("sh", ["-c", command], { cwd: dir, stdio: "pipe" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
