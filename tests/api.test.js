import { describe, expect, it } from "vitest";
import { apiHeaders } from "../src/api/client.js";

describe("Bible App client", () => {
  it("uses safe local demo identity without a secret", () => {
    const headers = apiHeaders();
    expect(headers["X-Tenant-ID"]).toBe("tenant-demo");
    expect(headers["X-User-ID"]).toBe("user-demo");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Request-ID"]).toMatch(/^web_/);
  });

  it("allows request headers to add content type", () => {
    const headers = apiHeaders({ "Content-Type": "application/json" });
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
