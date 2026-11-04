import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT || 8080);
const publicIndexingEnabled = process.env.EFATA_PUBLIC_INDEXING_ENABLED === "true";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
function validateApiOrigin(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const internal = url.hostname.endsWith(".railway.internal");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")
      || (url.protocol === "http:" && !internal && !["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
const apiOrigin = validateApiOrigin(process.env.BIBLE_API_ORIGIN || "");
const requestHeaderAllowlist = new Set([
  "accept", "content-type", "content-length", "cookie", "origin", "x-csrf-token",
  "x-request-id", "last-event-id", "idempotency-key",
]);
const responseHeaderAllowlist = new Set([
  "content-type", "cache-control", "set-cookie", "retry-after",
  "x-request-id", "content-disposition",
]);
const maxPayloadBytes = 1024 * 1024;

function proxyApi(request, response) {
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(request.method)) {
    sendText(response, 405, "Method not allowed");
    return;
  }
  if (!apiOrigin) { sendText(response, 503, "BIBLE_API_ORIGIN is not configured"); return; }
  let target;
  try {
    if (!request.url?.startsWith("/api/") || /%2f|%5c|\\\\/i.test(request.url)) throw Error();
    target = new URL(request.url, apiOrigin);
    if (target.origin !== apiOrigin || !target.pathname.startsWith("/api/")) throw Error();
  } catch {
    sendText(response, 400, "Invalid API path");
    return;
  }
  const declared = Number(request.headers["content-length"] || 0);
  if (!Number.isSafeInteger(declared) || declared > maxPayloadBytes) {
    sendText(response, 413, "Payload too large"); return;
  }
  const outgoing = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (requestHeaderAllowlist.has(name) && value !== undefined) outgoing[name] = value;
  }
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  let finished = false;
  const upstream = transport(target, { method: request.method, headers: outgoing }, (upstreamResponse) => {
    const safeHeaders = { ...headers, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (responseHeaderAllowlist.has(name)) safeHeaders[name] = value;
    }
    if (finished) { upstreamResponse.destroy(); return; }
    response.writeHead(upstreamResponse.statusCode || 502, safeHeaders);
    if (request.method === "HEAD") { upstreamResponse.resume(); response.end(); return; }
    if (String(upstreamResponse.headers["content-type"] || "").startsWith("text/event-stream")) {
      upstreamResponse.setTimeout(0);
    }
    upstreamResponse.pipe(response);
  });
  upstream.setTimeout(30000, () => upstream.destroy());
  upstream.on("error", () => {
    if (finished) return;
    finished = true;
    if (!response.headersSent) sendText(response, 502, "BIBLE_API_UNAVAILABLE");
    else response.end();
  });
  let totalBytes = 0;
  request.on("data", (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > maxPayloadBytes && !finished) {
      finished = true;
      request.unpipe(upstream);
      upstream.destroy();
      if (!response.headersSent) sendText(response, 413, "Payload too large");
      else response.end();
    }
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
}

const headers = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), geolocation=(), payment=(), usb=(), microphone=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests",
};

function sendText(response, status, message, additionalHeaders = {}) {
  response.writeHead(status, { ...headers, ...additionalHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(message);
}

createServer((request, response) => {
  if ((request.url || "").startsWith("/api/")) {
    proxyApi(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return;
  }

  let requestPath;
  try {
    requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    sendText(response, 400, "Bad request");
    return;
  }
  if (requestPath.includes("\0") || requestPath.includes("\\") || !requestPath.startsWith("/")) {
    sendText(response, 400, "Bad request");
    return;
  }
  if (requestPath === "/app") {
    response.writeHead(308, { ...headers, Location: "/app/", "Cache-Control": "no-cache" });
    response.end();
    return;
  }

  const candidate = normalize(join(root, requestPath));
  if (candidate !== root && !candidate.startsWith(`${root}/`)) {
    sendText(response, 404, "Not found", { "X-Robots-Tag": "noindex" });
    return;
  }

  let file = candidate;
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (requestPath === "/" || requestPath === "/index.html") file = join(root, "index.html");
    else if (requestPath.startsWith("/app/")) file = join(root, "app", "index.html");
    else {
      sendText(response, 404, "Not found", { "X-Robots-Tag": "noindex" });
      return;
    }
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    sendText(response, 404, "Not found", { "X-Robots-Tag": "noindex" });
    return;
  }
  const privateRoute = requestPath.startsWith("/app/");
  const extension = extname(file);
  const cache = extension === ".html" || extension === ".xml" || extension === ".txt"
    ? "no-cache"
    : requestPath.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";
  const responseHeaders = {
    ...headers,
    "Content-Type": mime[extension] || "application/octet-stream",
    "Cache-Control": cache,
    ...((privateRoute || !publicIndexingEnabled) ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {}),
  };
  response.writeHead(200, responseHeaders);
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log(`bible-app listening on 0.0.0.0:${port}`);
});
