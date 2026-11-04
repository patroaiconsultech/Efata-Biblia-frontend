# Security model — Bible App

O frontend é público e não é uma zona de confiança. Ele nunca decide tenant, role, entitlement ou rights; somente apresenta os contratos retornados pelo Bible API.

Nenhuma API key, client secret, DATABASE_URL, chave criptográfica ou token permanente pode aparecer em `VITE_*`, no bundle `dist` ou no HTML. O fluxo de produção deve usar OIDC Authorization Code + PKCE, com state/nonce/verifier em sessão temporária e token tratado conforme o provedor.

O servidor estático aplica `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`. `connect-src` deve apontar apenas para o Bible API aprovado. O fallback SPA deve rejeitar path traversal e não deve entregar arquivos fora de `dist`.

A UI deve separar blocos de Escritura, contexto histórico, interpretação, reflexão, aplicação, oração e safety. Ela deve mostrar fonte, tradução, corpus, versão e citação. Conteúdo de IA nunca deve ser inserido como HTML não sanitizado.

Acessibilidade é requisito: navegação por teclado, foco visível, labels, contraste, leitura por screen reader, redução de movimento, tamanho de fonte e estados de erro legíveis. Em API down ou stream incompleto, a interface deve informar o estado sem expor detalhes internos.
