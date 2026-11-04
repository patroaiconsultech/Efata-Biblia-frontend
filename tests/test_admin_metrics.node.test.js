import test from "node:test";
import assert from "node:assert/strict";
import { metricCards, displayCount } from "../src/admin/metrics.js";

test("Dashboard does not represent unavailable telemetry as zero", () => {
  assert.equal(displayCount(undefined), "Não instrumentado");
  assert.equal(displayCount(null), "Não instrumentado");
  assert.equal(displayCount(-1), "Não instrumentado");
  assert.equal(displayCount(0), "0");
  assert.equal(displayCount(1234), new Intl.NumberFormat("pt-BR").format(1234));
});

test("Dashboard labels observation without implying paying customers", () => {
  const descriptions = metricCards.map((card) => card.join(" ").toLowerCase()).join(" ");
  assert.match(descriptions, /não cadastros/);
  assert.match(descriptions, /não vendas/);
  assert.match(descriptions, /não equivale a assinantes pagantes/);
  assert.equal(new Set(metricCards.map((item) => item[0])).size, metricCards.length);
});
