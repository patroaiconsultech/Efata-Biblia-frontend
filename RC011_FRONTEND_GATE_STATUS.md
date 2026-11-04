# RC 0.11-FG1 — Gate de homologação React/Vite (PROPOSAL_ONLY)
Data: 2026-11-03. Base: RC 0.11 auditada pelo AO-01.

## Escopo
- Adiciona `.github/workflows/frontend-gate.yml`: CI somente lint/teste/build/browser, sem deploy.
- Fortalece `ci/verify.sh`: `npm ci`, ESLint, 17 testes Node, Vitest, build Vite e `ci/check_bundle.sh`.
- Adiciona `ci/e2e_smoke.py`: smoke de bundle **produção** via Vite preview, Chromium e API sintética, cobrindo leitura anônima, busca, planos sem cobrança, autenticação ausente fail-closed e captura de exceções do navegador.
- Separa explicitamente Vitest (`tests/api.test.js`) dos testes Node nativos (`tests/*.node.test.js`) no `package.json`, evitando que dois runners disputem os mesmos arquivos.
- Completa os globais necessários a Node 22 nas regras ESLint dos testes (`AbortController`, `Response`, `DOMException`, `setTimeout` e `globalThis`).
- Nenhum componente React, backend, migration, domínio financeiro ou credencial foi alterado.

## Evidência local
- `node --test ...`: 17/17 PASS.
- `npm ci --offline`: ENOTCACHED (`yocto-queue@0.1.0`), limitação do registry/cache neste ambiente.
- Build `npm run build`, ESLint, Vitest e browser React: **PENDENTES** até execução do CI com registry disponível.
- A suíte Python/backend 115/115 foi validada pelo AO-01 sobre o RC 0.11 original, não reexecutada nesta proposta exclusivamente frontend.

## Reprodução (em ambiente com acesso ao registry npm)
Na raiz de `bible-app`:
```bash
VITE_API_BASE_URL=http://127.0.0.1:19001 bash ci/verify.sh
python -m pip install 'playwright==1.57.0'
python -m playwright install chromium
python ci/e2e_smoke.py
```
A prova em navegador usa API sintética local. Não é homologação de OIDC real, Asaas, PostgreSQL ou implantação.

A workflow `.github/workflows/frontend-gate.yml` deve ficar na **raiz do repositório Git** que contiver o frontend, e não em um subdiretório inacessível ao GitHub Actions.

## Gate comercial
NO-GO para publicação, billing ativo e migrations remotas; requer CI verde comprovado, OIDC real, RLS PostgreSQL, corpus homologado e testes de integração reais.
Rollback do incremento: restaurar `ci/verify.sh` original e remover os três novos arquivos `.github/workflows/frontend-gate.yml`, `ci/e2e_smoke.py` e este documento; restaurar também `package.json` e `eslint.config.mjs` do RC 0.11.
