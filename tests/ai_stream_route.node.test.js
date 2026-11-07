import test from "node:test";
import assert from "node:assert/strict";
import { consumeBibleStream } from "../src/sse/stream.js";

async function checkPath(optIn, expectedPath) {
  const oldFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path, options = {}) => {
    requests.push([path, options]);
    if (path === "/api/auth/me") {
      return new Response(JSON.stringify({
        user_id: "user-one",
        tenant_id: "tenant-one",
      }), { headers: { "content-type": "application/json" } });
    }
    assert.equal(path, expectedPath);
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    const sent = JSON.parse(options.body);
    if (optIn) assert.equal(sent.ai_opt_in, true);
    else assert.equal(Object.hasOwn(sent, "ai_opt_in"), false);
    assert.equal(sent.request_id, options.headers["X-Request-ID"]);
    const event = (type, sequence, payload) => ({
      schema_version: "bible.sse.v1",
      event_id: `evt_${sequence}`,
      event_type: type,
      request_id: sent.request_id,
      execution_id: "exe_test",
      tenant_id: "tenant-one",
      thread_id: "main",
      agent_id: "bible_guide",
      turn_owner: "bible_guide",
      sequence,
      payload,
    });
    const sse = [
      event("meta", 1, {}),
      event("content.delta", 2, {
        block_type: "AI_REFLECTION",
        delta: "Resposta de teste",
        citations: [],
      }),
      event("done", 3, {
        outcome: "success",
        done_observed: true,
      }),
    ].map(e => `event: ${e.event_type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(sse, {
      headers: { "content-type": "text/event-stream" },
    });
  };
  try {
    const types = [];
    const result = await consumeBibleStream(
      "main", "Teste", "THEMATIC_STUDY",
      (type) => types.push(type),
      undefined, optIn,
    );
    assert.equal(result.sequence, 3);
    assert.deepEqual(types, ["meta", "content.delta", "done"]);
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = oldFetch;
  }
}

test("deterministic mode retains exact same-origin SSE route", async () => {
  await checkPath(false, "/api/conversations/main/stream");
});

test("explicit opt-in uses separate /ai-stream route", async () => {
  await checkPath(true, "/api/conversations/main/ai-stream");
});
