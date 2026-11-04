import test from "node:test";
import assert from "node:assert/strict";
import { createBibleSseParser } from "../src/sse/protocol.js";
import { consumeBibleStream } from "../src/sse/stream.js";

function event(type, sequence, payload = {}, overrides = {}) {
  return {
    schema_version: "bible.sse.v1",
    event_type: type,
    event_id: `evt-${sequence}`,
    request_id: "req-1",
    execution_id: "exe-1",
    tenant_id: "tenant-1",
    thread_id: "main",
    agent_id: "bible_guide",
    turn_owner: "bible_guide",
    sequence,
    payload,
    ...overrides,
  };
}
function wire(e, separator = "\n") {
  return `event: ${e.event_type}${separator}data: ${JSON.stringify(e)}${separator}${separator}`;
}
function parse(raw) {
  const emitted = [];
  const parser = createBibleSseParser((type, e) => emitted.push({ type, e }));
  parser.push(raw);
  return { parser, emitted };
}
const meta = () => wire(event("meta", 1));
const done = (sequence = 2, outcome = "success") => wire(event("done", sequence, { outcome, done_observed: true }));

test("accepts actual backend envelope, CRLF split across byte chunks and comments", () => {
  const events = [];
  const parser = createBibleSseParser((type) => events.push(type));
  const input = `: heartbeat\r\n\r\n${wire(event("meta", 1), "\r\n")}${wire(event("content.delta", 2, { delta: "Texto" }), "\r\n")}${wire(event("done", 3, { outcome: "success", done_observed: true }), "\r\n")}`;
  for (const character of input) parser.push(character);
  assert.deepEqual(events, ["meta", "content.delta", "done"]);
  assert.deepEqual(parser.finish(), { sequence: 3 });
});

test("accepts a multi-line SSE data field containing a pretty-printed JSON event", () => {
  const pretty = JSON.stringify(event("meta", 1), null, 2).split("\n").map((line) => `data: ${line}`).join("\n");
  const { parser, emitted } = parse(`event: meta\n${pretty}\n\n${done()}`);
  assert.equal(parser.finish().sequence, 2);
  assert.equal(emitted.length, 2);
});

test("refuses content or done before the canonical meta envelope", () => {
  assert.throws(() => parse(wire(event("content.delta", 1))), /BIBLE_SSE_META_MISSING/);
  assert.throws(() => parse(wire(event("done", 1, { outcome: "success", done_observed: true }))), /BIBLE_SSE_META_MISSING/);
});

test("refuses missing terminal, duplicate meta and noncontiguous sequence", () => {
  assert.throws(() => parse(meta()).parser.finish(), /BIBLE_SSE_TERMINAL_EVENT_MISSING/);
  assert.throws(() => parse(meta() + wire(event("meta", 2))), /BIBLE_SSE_META_DUPLICATE/);
  assert.throws(() => parse(meta() + done(3)), /BIBLE_SSE_SEQUENCE_INVALID/);
});

test("refuses tenant, thread, execution, request and owner changes", () => {
  for (const [key, value] of [
    ["tenant_id", "tenant-2"],
    ["thread_id", "other-thread"],
    ["execution_id", "other-execution"],
    ["request_id", "other-request"],
    ["agent_id", "other-agent"],
    ["turn_owner", "other-owner"],
  ]) {
    assert.throws(
      () => parse(meta() + wire(event("content.delta", 2, { delta: "x" }, { [key]: value }))),
      /BIBLE_SSE_.*MISMATCH/,
      `${key} must stay canonical`,
    );
  }
});

test("refuses duplicate done, any events after done and invalid success after error", () => {
  assert.throws(() => parse(meta() + done(2) + done(3)), /BIBLE_SSE_EVENT_AFTER_DONE/);
  assert.throws(() => parse(meta() + done(2) + wire(event("content.delta", 3, {}))), /BIBLE_SSE_EVENT_AFTER_DONE/);
  assert.throws(() => parse(meta() + wire(event("error", 2, { code: "DENIED" })) + done(3)), /BIBLE_SSE_DONE_OUTCOME_INVALID/);
});

test("accepts error + done and cancelled + done, never as success", () => {
  for (const type of ["error", "cancelled"]) {
    const { parser, emitted } = parse(meta() + wire(event(type, 2, {})) + done(3, type));
    assert.deepEqual(emitted.map((item) => item.type), ["meta", type, "done"]);
    assert.equal(parser.finish().sequence, 3);
  }
});

test("rejects unsupported schema, invalid JSON, wrong event type and incomplete frame", () => {
  assert.throws(() => parse(wire(event("meta", 1, {}, { schema_version: "unknown" }))), /BIBLE_SSE_SCHEMA_UNSUPPORTED/);
  assert.throws(() => parse("event: meta\ndata: {oops}\n\n"), /BIBLE_SSE_EVENT_JSON_INVALID/);
  assert.throws(() => parse("event: done\ndata: " + JSON.stringify(event("meta", 1)) + "\n\n"), /BIBLE_SSE_EVENT_TYPE_MISMATCH/);
  assert.throws(() => parse(meta() + "event: done\ndata: {}").parser.finish(), /BIBLE_SSE_INCOMPLETE_FRAME/);
});

test("rejects first meta from another tenant, thread or request even if wire stream is internally consistent", () => {
  for (const field of ["tenant_id", "thread_id", "request_id"]) {
    const received = [];
    const expected = { tenant_id: "tenant-1", thread_id: "main", request_id: "req-1" };
    const parser = createBibleSseParser((type) => received.push(type), { ...expected, [field]: `expected-${field}` });
    assert.throws(() => parser.push(meta() + done()), new RegExp(`BIBLE_SSE_${field.toUpperCase()}_MISMATCH`));
    assert.deepEqual(received, [], `a wrong first meta must not reach the UI (${field})`);
  }
});

test("accepts first meta matching explicitly bound request context", () => {
  const received = [];
  const parser = createBibleSseParser((type) => received.push(type), {
    tenant_id: "tenant-1", thread_id: "main", request_id: "req-1",
  });
  parser.push(meta() + done());
  assert.deepEqual(received, ["meta", "done"]);
  assert.equal(parser.finish().sequence, 2);
});

async function withFetch(fakeFetch, callback) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("SSE consumer obtains trusted tenant from /api/auth/me and binds body request_id to first meta", async () => {
  const calls = [];
  const received = [];
  await withFetch(async (url, options) => {
    calls.push({ url, options });
    if (String(url).endsWith("/api/auth/me")) {
      return new Response(JSON.stringify({ tenant_id: "verified-tenant", user_id: "verified-user" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    assert.ok(String(url).endsWith("/api/conversations/main/stream"));
    const body = JSON.parse(options.body);
    assert.equal(body.thread_id, "main");
    assert.ok(body.request_id.startsWith("web_"));
    assert.equal(options.headers["X-Request-ID"], body.request_id);
    return new Response(
      wire(event("meta", 1, {}, { tenant_id: "verified-tenant", request_id: body.request_id })) +
      wire(event("content.delta", 2, { delta: "Ok" }, { tenant_id: "verified-tenant", request_id: body.request_id })) +
      wire(event("done", 3, { outcome: "success", done_observed: true }, { tenant_id: "verified-tenant", request_id: body.request_id })),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }, async () => {
    const result = await consumeBibleStream("main", "Teste", "SCRIPTURE_EXPLANATION", (type) => received.push(type));
    assert.equal(result.sequence, 3);
  });
  assert.deepEqual(received, ["meta", "content.delta", "done"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["X-Tenant-ID"], "tenant-demo");
});

test("SSE consumer rejects valid-looking first meta belonging to another tenant, thread or request", async () => {
  for (const wrongField of ["tenant_id", "thread_id", "request_id"]) {
    let callbackCalled = false;
    await withFetch(async (url, options) => {
      if (String(url).endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ tenant_id: "verified-tenant", user_id: "verified-user" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = JSON.parse(options.body);
      const envelope = {
        tenant_id: "verified-tenant",
        thread_id: "main",
        request_id: body.request_id,
      };
      envelope[wrongField] = "foreign-" + wrongField;
      return new Response(wire(event("meta", 1, {}, envelope)) + wire(event("done", 2, { outcome: "success", done_observed: true }, envelope)), {
        headers: { "Content-Type": "text/event-stream" },
      });
    }, async () => {
      await assert.rejects(
        consumeBibleStream("main", "Teste", "SCRIPTURE_EXPLANATION", () => { callbackCalled = true; }),
        new RegExp(`BIBLE_SSE_${wrongField.toUpperCase()}_MISMATCH`),
      );
    });
    assert.equal(callbackCalled, false, wrongField);
  }
});

test("SSE consumer aborts without streaming if authenticated principal lookup fails", async () => {
  const calls = [];
  await withFetch(async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ detail: { code: "AUTH_TOKEN_REQUIRED", message: "Not authenticated" } }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    await assert.rejects(
      consumeBibleStream("main", "Teste", "SCRIPTURE_EXPLANATION", () => {}),
      /Not authenticated/,
    );
  });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("/api/auth/me"));
});

test("SSE cancellation during principal lookup prevents stream POST", async () => {
  const controller = new AbortController();
  let called = 0;
  await withFetch(async (_url, options) => {
    called += 1;
    assert.equal(options.signal, controller.signal);
    controller.abort();
    throw new DOMException("The operation was aborted.", "AbortError");
  }, async () => {
    await assert.rejects(
      consumeBibleStream("main", "Teste", "SCRIPTURE_EXPLANATION", () => {}, controller.signal),
      (error) => error.name === "AbortError",
    );
  });
  assert.equal(called, 1);
});
