import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

test("public landing has server-visible SEO metadata and exactly one H1", () => {
  const html = read("index.html");
  assert.match(html, /<html lang="pt-BR">/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  for (const value of [
    '<title>EfaTÀ 777 | Bíblia Digital com IA e Reflexões para a Vida</title>',
    '<link rel="canonical" href="https://efata777.com/">',
    'property="og:image"',
    'name="twitter:card"',
    'name="description"',
    'id="perguntas"',
    'A inteligência artificial substitui orientação espiritual?',
    'O aplicativo já pode ser assinado?',
  ]) assert.ok(html.includes(value), `SEO/visible content missing: ${value}`);
  assert.doesNotMatch(html, /<script type="module" src="\/src\/main/);
});

test("structured data describes the existing website and makes no unsupported pricing claims", () => {
  const html = read("index.html");
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, "Website JSON-LD must be present in source HTML");
  const data = JSON.parse(block[1]);
  assert.equal(data["@context"], "https://schema.org");
  assert.equal(data["@graph"][0]["@type"], "WebSite");
  assert.equal(data["@graph"][1]["@type"], "WebPage");
  assert.ok(data["@graph"].every((x) => !x.offers && !x.aggregateRating));
});

test("robots, sitemap and native application entry are separated", () => {
  const robots = read("public/robots.txt");
  const sitemap = read("public/sitemap.xml");
  const app = read("app/index.html");
  assert.doesNotMatch(robots, /Disallow: \/app\//); // Let crawlers see the noindex response.
  assert.match(robots, /Sitemap: https:\/\/efata777\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/efata777\.com\/<\/loc>/);
  assert.match(app, /noindex, nofollow/);
  assert.match(app, /<div id="root"><\/div>/);
});

test("public navigation and mobile menu are progressive enhancements", () => {
  const html = read("index.html");
  const js = read("public/landing.js");
  const css = read("public/landing.css");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const [, fragment] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(fragment), `Anchor target missing: #${fragment}`);
  }
  assert.match(js, /aria-expanded/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /<details>/);
});
