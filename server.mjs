import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
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
function safeConnectOrigin(raw) {
  try {
    const parsed = new URL(raw);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}
const apiOrigin = safeConnectOrigin(process.env.BIBLE_API_ORIGIN || "http://localhost:8080");
const oidcOrigin = safeConnectOrigin(process.env.VITE_OIDC_ISSUER || "");

const headers = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), payment=(), usb=(), microphone=()",
  "Content-Security-Policy": `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${apiOrigin} ${oidcOrigin}; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests`,
};

function sendText(response, status, message, additionalHeaders = {}) {
  response.writeHead(status, { ...headers, ...additionalHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(message);
}

createServer((request, response) => {
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
    else if (requestPath.startsWith("/app/") || requestPath === "/auth/callback") file = join(root, "app", "index.html");
    else {
      sendText(response, 404, "Not found", { "X-Robots-Tag": "noindex" });
      return;
    }
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    sendText(response, 404, "Not found", { "X-Robots-Tag": "noindex" });
    return;
  }
  const privateRoute = requestPath.startsWith("/app/") || requestPath === "/auth/callback";
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
