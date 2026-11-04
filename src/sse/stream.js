import { api, apiHeaders, apiBaseUrl } from "../api/client.js";
import { createBibleSseParser } from "./protocol.js";

export async function consumeBibleStream(threadId, content, mode, onEvent, signal) {
  // Resolve the principal through the server's validated authentication path.
  // Never derive tenant identity from a browser-controlled header or an
  // unverified JWT payload.
  const principal = await api.authContext(signal);
  if (typeof principal.tenant_id !== "string" || !principal.tenant_id) {
    throw new Error("BIBLE_SSE_AUTH_CONTEXT_INVALID");
  }
  const headers = apiHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" });
  const requestId = headers["X-Request-ID"];
  const response = await fetch(`${apiBaseUrl()}/api/conversations/${encodeURIComponent(threadId)}/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ thread_id: threadId, content, mode, request_id: requestId }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Stream unavailable (${response.status})`);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
    throw new Error("BIBLE_SSE_CONTENT_TYPE_INVALID");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createBibleSseParser(onEvent, {
    tenant_id: principal.tenant_id,
    thread_id: threadId,
    request_id: requestId,
  });
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    const result = parser.finish();
    completed = true;
    return result;
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
