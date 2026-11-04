# Bíblia Sagrada Digital — Bible App

Frontend independente da Bíblia Sagrada Digital. O aplicativo oferece leitura determinística, busca, jornada, diário/oração e Guia da Palavra com SSE.

## Desenvolvimento local

```bash
npm ci
cp .env.example .env
npm run dev
```

Abra http://localhost:5173 (Vite). O modo local envia headers demo somente para o Bible API local; `npm start` serve um build de produção, que exige configuração OIDC real. Em produção, o login deve usar OIDC Authorization Code + PKCE e o backend deve decidir identidade, tenant, role e autorização.

## Build e execução

```bash
npm run build
PORT=8080 npm start
```

## Princípios de produto

A leitura básica não depende de IA ou ORKIO. O frontend separa Escritura, contexto, interpretação e reflexão. A fonte Bíblia Livre é atribuída na interface e a licença é preservada no backend/corpus.

O bundle não deve conter API keys, client secrets, tokens, DATABASE_URL ou chaves de criptografia. Apenas variáveis públicas como `VITE_API_BASE_URL` podem ser usadas no build.
\n> RC 0.12-FP1 (local, proposta): cadastro opcional de tradição de fé com consentimento e exclusão; o corpus atual ainda não cobre todos os cânones. Veja `RC012_FAITH_PROFILE_STATUS.md` na raiz do pacote. Sem deploy ou cobrança.\n

## RC 0.14 — Gestão (somente demo local)

A aba **Gestão** aparece somente quando `/api/auth/me` devolve role `admin`.
Para uma demonstração local segura, configure `VITE_DEMO_ADMIN_ENABLED=true` no frontend
e inclua **explicitamente** o usuário demo em `BIBLE_DEMO_ADMIN_USERS` no backend.
O backend continua sendo a autoridade; a variável frontend não concede autorização.
O endpoint `/api/admin/overview` exige SQLite local e não funciona em staging/produção.
Não exibe religião, conteúdos privados, diálogos, nomes nem receita não comprovada.
