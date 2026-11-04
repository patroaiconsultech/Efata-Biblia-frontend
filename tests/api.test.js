import { describe, expect, it } from "vitest";
import { apiHeaders, setCsrfToken, apiBaseUrl } from "../src/api/client.js";

describe("Bible native-session client", () => {
  it("never derives user/tenant role from browser", () => {
    const headers = apiHeaders();
    expect(headers["X-Tenant-ID"]).toBeUndefined();
    expect(headers["X-User-ID"]).toBeUndefined();
    expect(headers["X-Role"]).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Request-ID"]).toMatch(/^web_/);
    expect(apiBaseUrl()).toMatch(/mesma origem/);
  });
  it("adds CSRF only on write requests, without storage", () => {
    setCsrfToken("a".repeat(64));
    expect(apiHeaders({}, "POST")["X-CSRF-Token"]).toBe("a".repeat(64));
    expect(apiHeaders()["X-CSRF-Token"]).toBeUndefined();
    setCsrfToken(null);
    expect(apiHeaders({}, "POST")["X-CSRF-Token"]).toBeUndefined();
  });
});
