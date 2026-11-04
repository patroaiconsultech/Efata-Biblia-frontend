# EfaTÀ 777 — Landing Premium SEO LP1

Status: **candidato de desenvolvimento, não publicado**  
Base: `EFATA777_BIBLIA_RC012_FP1_FRONTEND_RAIZ_GIT.zip` (artefato local; sem branch/commit Git verificados)  
Ambiente: cópia isolada em `/mnt/data`; backend, billing e banco inalterados.  
Data: 2026-11-04.

## Entrega

- `/` contém landing estática com H1, conteúdo real no HTML, OG/Twitter, `WebSite`/`WebPage` JSON-LD, FAQs, metadados e canonical.
- `/app/` preserva a SPA React, com `noindex` no HTML e `X-Robots-Tag` do servidor.
- `/auth/callback` é mapeada ao app e o OIDC retorna para `/app/` após autenticação.
- Vite tem múltiplas entradas HTML, `index.html` e `app/index.html`.
- `public` contém CSS, JS, imagem OG, ícone, sitemap e robots.
- `server.mjs` responde 404 a rotas desconhecidas e usa `X-Robots-Tag: noindex` por padrão.
- `EFATA_PUBLIC_INDEXING_ENABLED=true` habilita indexação pública **somente após autorização de release**. Em qualquer caso, `/app/` e `/auth/callback` permanecem noindex.
- Mobile menu acessível; FAQs funcionam sem JavaScript.
- Sem Analytics, cookies de rastreamento, formulário, requisição financeira ou coleta de religião na landing.

## SEO e publicação

A URL canônica, o sitemap e a imagem Open Graph estão configurados provisoriamente para **https://efata777.com/**. Isto **não é confirmação de registro ou controle de domínio**.

Antes de publicação: verificar controle de domínio e marca/INPI; ajustar a URL final consistentemente em `index.html`, `robots.txt` e `sitemap.xml`; atualizar contatos e política de privacidade se houver coleta; concluir direitos do corpus; homologar o frontend e configurar TLS, redirects www/.com.br, Search Console, robots de staging e teste de resultados enriquecidos. Nunca criar `SoftwareApplication.offers` ou preços fictícios enquanto assinaturas não existirem.

## Evidências locais

- `npm run test:logic` → **25/25 PASS** (inclui testes SEO, servidor e fluxo existente).
- `node --check` e validação DOM/JSON-LD/âncoras → PASS.
- Renderização visual do HTML/CSS em Chromium isolado 1440×900 e 390×844: sem exceções JavaScript e sem scroll horizontal; menu mobile abriu/fechou.
- **Não comprova o bundle Vite**: `npm ci --offline` falha por `yocto-queue@0.1.0` ausente no cache.
- Vitest, ESLint e navegador E2E sobre build Vite → PENDING.

## Comandos esperados para CI

```bash
npm ci --no-audit --no-fund
npm run lint
npm run test:logic
npm test
npm run build
bash ci/check_bundle.sh
python ci/e2e_smoke.py
```

O último comando exige Playwright Chromium e a fixture API local prevista no script.

## Riscos e rollback

- Nenhum commit, merge, publicação, migration, operação no Asaas ou alteração da ORKIO.
- Git root/branch/commit oficial **não comprovados**; comparar delta ao HEAD antes de aplicar.
- SEO depende de desempenho e configuração no servidor público; nenhuma posição no Google é garantida.
- Preview HTML é conceitual; não anuncia assinatura, testemunhos ou cobertura de todos os cânones.

Rollback local: restaurar frontend do ZIP RC012 original, removendo `app/index.html`, `public/*`, `tests/landing.node.test.js` e a alteração de rotas/branding. Sem rollback de banco.
