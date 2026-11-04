/**
 * Bible SSE v1 wire parser. No browser APIs and no API credentials.
 * Strictly validates identity, ordering and terminality before rendering.
 */
const MAX_PENDING_CHARS = 1_048_576;
const EVENT_TYPES = new Set(["meta", "citation", "content.delta", "content.final", "error", "cancelled", "done"]);

function fail(code) {
  throw new Error(code);
}

export function createBibleSseParser(onEvent, expectedIdentity = {}) {
  let pending = "";
  let frame = [];
  let frameChars = 0;
  let identity = null;
  let lastSequence = 0;
  let doneSeen = false;
  let outcomeSignal = null;

  function dispatch() {
    if (frame.length === 0) return;
    const lines = frame;
    frame = [];
    frameChars = 0;
    let type = "message";
    const data = [];
    for (const line of lines) {
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const key = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (key === "event") type = value;
      if (key === "data") data.push(value);
    }
    if (data.length === 0) return; // Comments/heartbeats carry no application data.
    if (doneSeen) fail("BIBLE_SSE_EVENT_AFTER_DONE");
    if (!EVENT_TYPES.has(type)) fail("BIBLE_SSE_EVENT_TYPE_UNSUPPORTED");

    let event;
    try {
      event = JSON.parse(data.join("\n"));
    } catch {
      fail("BIBLE_SSE_EVENT_JSON_INVALID");
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) fail("BIBLE_SSE_EVENT_INVALID");
    if (event.schema_version !== "bible.sse.v1") fail("BIBLE_SSE_SCHEMA_UNSUPPORTED");
    if (event.event_type !== type) fail("BIBLE_SSE_EVENT_TYPE_MISMATCH");
    if (event.agent_id !== "bible_guide" || event.turn_owner !== "bible_guide") fail("BIBLE_SSE_OWNERSHIP_MISMATCH");
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== lastSequence + 1) fail("BIBLE_SSE_SEQUENCE_INVALID");
    for (const field of ["tenant_id", "thread_id", "request_id", "execution_id"]) {
      if (typeof event[field] !== "string" || !event[field]) fail("BIBLE_SSE_IDENTITY_MISSING");
    }
    if (event.payload === null || typeof event.payload !== "object" || Array.isArray(event.payload)) fail("BIBLE_SSE_PAYLOAD_INVALID");

    if (!identity) {
      if (type !== "meta") fail("BIBLE_SSE_META_MISSING");
      // Bind the first server envelope to the context known before the request.
      // In particular, matching only subsequent envelopes is insufficient:
      // another tenant/thread can produce an internally consistent stream.
      for (const field of ["tenant_id", "thread_id", "request_id", "execution_id"]) {
        if (Object.hasOwn(expectedIdentity, field) && event[field] !== expectedIdentity[field]) {
          fail(`BIBLE_SSE_${field.toUpperCase()}_MISMATCH`);
        }
      }
      identity = Object.fromEntries(["tenant_id", "thread_id", "request_id", "execution_id"].map((field) => [field, event[field]]));
    } else {
      if (type === "meta") fail("BIBLE_SSE_META_DUPLICATE");
      for (const [field, original] of Object.entries(identity)) {
        if (event[field] !== original) fail(`BIBLE_SSE_${field.toUpperCase()}_MISMATCH`);
      }
    }

    if (type === "error") outcomeSignal = "error";
    if (type === "cancelled") outcomeSignal = "cancelled";
    if (type === "done") {
      const expected = outcomeSignal || "success";
      if (event.payload.outcome !== expected || event.payload.done_observed !== true) fail("BIBLE_SSE_DONE_OUTCOME_INVALID");
      doneSeen = true;
    }
    lastSequence = event.sequence;
    onEvent(type, event);
  }

  function consumeLine(line) {
    if (line === "") {
      dispatch();
      return;
    }
    frameChars += line.length;
    if (frameChars > MAX_PENDING_CHARS) fail("BIBLE_SSE_FRAME_TOO_LARGE");
    frame.push(line);
  }

  return {
    push(fragment) {
      pending += fragment;
      if (pending.length > MAX_PENDING_CHARS) fail("BIBLE_SSE_FRAME_TOO_LARGE");
      // Preserve a trailing CR until the next chunk, so CRLF across boundaries works.
      while (true) {
        const match = /\r\n|\n|\r(?!$)/.exec(pending);
        if (!match) break;
        const line = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        consumeLine(line);
      }
    },
    finish() {
      if (pending.trim() || frame.length) fail("BIBLE_SSE_INCOMPLETE_FRAME");
      if (!doneSeen) fail("BIBLE_SSE_TERMINAL_EVENT_MISSING");
      return { sequence: lastSequence };
    },
  };
}
