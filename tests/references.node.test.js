import test from "node:test";
import assert from "node:assert/strict";
import { parseTextUnitId, formatTextUnitReference } from "../src/lib/references.js";

test("reference IDs are decoded without trusting unstructured input", () => {
  assert.deepEqual(parseTextUnitId("tu_work_1joao_2_15"), { workId: "work_1joao", chapter: 2, verse: 15 });
  assert.equal(parseTextUnitId("tu_work_gen_0_1"), null);
  assert.equal(parseTextUnitId("tu_work_gen_1_-1"), null);
  assert.equal(parseTextUnitId("foo"), null);
  assert.equal(parseTextUnitId("tu_work_gen_9999999999999999999999999_1"), null);
  assert.equal(parseTextUnitId(null), null);
});

test("book names are resolved only from known catalogue metadata", () => {
  const works = [{ work_id: "work_gen", title: "Gênesis" }];
  assert.equal(formatTextUnitReference("tu_work_gen_1_1", works), "Gênesis 1:1");
  assert.equal(formatTextUnitReference("not-an-id", works), "Referência não reconhecida");
});
