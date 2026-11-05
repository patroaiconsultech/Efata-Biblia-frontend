import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("Vite 8 multipage build declares landing and app as top-level inputs", () => {
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

test("Docker build fails if either HTML or landing asset is missing", () => {
  const docker = read("../Dockerfile");
  for (const file of ["dist/index.html", "dist/app/index.html", "dist/landing.css", "dist/landing.js"]) {
    assert.ok(docker.includes(`test -s ${file}`), `${file} must be verified`);
  }
  assert.ok(!docker.includes("npm run build \\\\"));
});
