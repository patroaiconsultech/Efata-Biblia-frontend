import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("LP2 landing shows three proposed plans without purchase actions", () => {
  const html = read("index.html");
  assert.match(html, /id="planos"/);
  assert.match(html, /href="#planos"/);
  for (const [name, price] of [
    ["Essencial", "29,90"],
    ["Jornada", "59,90"],
    ["Aprofundar", "99,90"],
  ]) {
    assert.ok(html.includes(`<h3 id="plan-${name.toLowerCase()}">${name}</h3>`));
    assert.ok(html.includes(`<strong>${price}</strong>`));
  }
  assert.equal((html.match(/class="pricing-card(?: pricing-featured)?"/g) || []).length, 3);
  assert.equal((html.match(/class="pricing-button"/g) || []).length, 3);
  assert.match(html, /sujeitos a validação/);
  assert.doesNotMatch(html, /<a[^>]+href="https:\/\/www\.asaas\.com/);
});

test("pricing does not emit unsupported Offer structured data or enable public checkout", () => {
  const html = read("index.html");
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block);
  const data = JSON.parse(block[1]);
  assert.ok(data["@graph"].every((x) => !x.offers && !x.aggregateRating));
  assert.match(html, /Nenhuma assinatura está sendo vendida nesta página/);
});

test("sandbox checkout is called from app only after explicit user click and when enabled", () => {
  const client = read("src/api/client.js");
  const app = read("src/App.jsx");
  assert.match(client, /createSandboxCheckout/);
  assert.match(app, /catalog\?\.checkout_enabled === true && import\.meta\.env\.MODE !== "production"/);
  assert.match(app, /disabled=\{!sandboxAvailable/);
  assert.match(app, /onClick=\{\(\) => requestSandboxCheckout\(plan\.code\)\}/);
  assert.match(app, /noopener noreferrer/);
});
