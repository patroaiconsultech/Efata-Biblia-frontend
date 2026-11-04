# Bible App — bootstrap de novo repositório (staging)

**Fonte:** RC 0.14 Admin Analytics, SHA-256 `64513d1ddc51c049fef86e47c5f952303cbf627af08d15876ed97678534ea888`.
Novo repositório **independente** da ORKIO Premium. Este ZIP NÃO contém histórico Git. O primeiro commit será um commit novo.
Status: pronto para revisão AO-01 e posterior bootstrap Git; **não homologado para produção**.

## Build e runtime

- Node 22; Dockerfile na raiz; `railway.toml` na raiz; `server.mjs` escuta `PORT`.
- O build Docker exige valores públicos HTTPS em `VITE_API_BASE_URL`, `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID` e `VITE_OIDC_REDIRECT_URI`.
- Coloque `BIBLE_API_ORIGIN` na mesma URL HTTPS da API e `VITE_OIDC_ISSUER` também no runtime (CSP do token endpoint).
- O CI testa Node, lint, Vitest, Vite, bundle e E2E Chromium, mas somente GitHub Actions poderá comprová-lo com npm online.
- `EFATA_PUBLIC_INDEXING_ENABLED=false` até aprovações jurídica/comercial/editorial.
- OIDC exige IdP real compatível com endpoints `/authorize` e `/token` e PKCE em browser; verificação de CORS em staging é gate obrigatório.
- PWA1 não estava no RC 0.14 recebido; não declarar instalabilidade do PWA.

Ver instruções completas no README_OPERACIONAL do pacote-mestre.
