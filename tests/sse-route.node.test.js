import test from "node:test";
import assert from "node:assert/strict";
import { consumeBibleStream } from "../src/sse/stream.js";

test("SSE POST uses the exact same-origin /api route (no display label prefix)", async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url) === "/api/auth/me") {
      return new Response(JSON.stringify({
        tenant_id: "tenant-test",
        user_id: "user-test",
      }), { headers: { "Content-Type": "application/json" } });
    }
    assert.equal(String(url), "/api/conversations/main/stream");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    const body = JSON.parse(options.body);
    assert.equal(options.headers["X-Request-ID"], body.request_id);
    const envelope = (type, sequence, payload) => ({
      schema_version: "bible.sse.v1",
      event_id: `evt_${sequence}`,
      event_type: type,
      request_id: body.request_id,
      execution_id: "exe_test",
      tenant_id: "tenant-test",
      thread_id: "main",
      agent_id: "bible_guide",
      turn_owner: "bible_guide",
      sequence,
      payload,
    });
    const events = [
      envelope("meta", 1, {}),
      envelope("done", 2, { outcome: "success", done_observed: true }),
    ].map(e => `event: ${e.event_type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(events, {
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  try {
    const seen = [];
    const result = await consumeBibleStream("main", "Teste", "SCRIPTURE_EXPLANATION", t => seen.push(t));
    assert.equal(result.sequence, 2);
    assert.deepEqual(seen, ["meta", "done"]);
    assert.deepEqual(calls, ["/api/auth/me", "/api/conversations/main/stream"]);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
