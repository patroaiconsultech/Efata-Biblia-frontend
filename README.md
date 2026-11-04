# EFATÀ 777 — Bible App RC014 native auth candidate
**Bootstrap independent repository. AO-01 staging review required; NOT PRODUCTION APPROVED.**

This is a candidate based on RC014 Admin Analytics plus the native-auth delta.
No ORKIO dependencies; no OIDC; session cookie issued by Bible API via the
Bible App same-origin `/api` reverse proxy in `server.mjs`.

## Local
Run the Bible API with a **local** database and native mode after migrating to
`009_bible_native_auth`. Set `BIBLE_API_ORIGIN=http://127.0.0.1:8080`
for Vite or production Node `server.mjs`, and start with `npm ci`,
`npm run test:logic`, `npm test`, `npm run build`.
`npm ci` and Vite build require a functioning npm registry.
For staging, use the values in `RAILWAY_STAGING_NATIVE.env.example`.

No `VITE_API_BASE_URL`, `VITE_OIDC_*`, `VITE_DEMO_*` values may be defined.
A public browser build must never receive secrets.

The frontend Railway healthcheck is `/api/readiness` through the proxy.
No CI workflow performs deploy/migrations automatically.
