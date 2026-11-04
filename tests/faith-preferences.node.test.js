import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api/client.js";

function mockFetch(onRequest) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    onRequest(String(url), options);
    return { ok: true, json: async () => ({ configured: true, preference: { tradition: "catholic", study_style: "my_tradition" } }), headers: { get: () => null } };
  };
  return () => { globalThis.fetch = previous; };
}

test("preference API is scoped to /me and does not set user or tenant from the form", async () => {
  let seen = 0;
  const restore = mockFetch((url, opts) => {
    seen += 1;
    assert.ok(url.endsWith("/api/faith-preferences/me"));
    assert.equal(opts.method, undefined);
  });
  try { await api.faithPreference(); assert.equal(seen, 1); }
  finally { restore(); }
});

test("saving a faith preference requires explicit consent in a dedicated API request", async () => {
  let seen = 0;
  const restore = mockFetch((url, opts) => {
    seen += 1;
    assert.ok(url.endsWith("/api/faith-preferences/me"));
    assert.equal(opts.method, "PUT");
    assert.equal(opts.headers["Content-Type"], "application/json");
    const data = JSON.parse(opts.body);
    assert.deepEqual(data, {
      tradition: "catholic",
      study_style: "my_tradition",
      consent: true,
      consent_version: "faith-preferences-v1",
    });
    assert.equal("user_id" in data, false);
    assert.equal("tenant_id" in data, false);
  });
  try { await api.saveFaithPreference("catholic", "my_tradition"); assert.equal(seen, 1); }
  finally { restore(); }
});

test("preference deletion does not depend on any religious input or checkout", async () => {
  let seen = 0;
  const restore = mockFetch((url, opts) => {
    seen += 1;
    assert.ok(url.endsWith("/api/faith-preferences/me"));
    assert.equal(opts.method, "DELETE");
    assert.equal(opts.body, undefined);
  });
  try { await api.deleteFaithPreference(); assert.equal(seen, 1); }
  finally { restore(); }
});
