import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { clearSession, handleCallback, isOidcCallback } from "./auth/oidc.js";

const root = createRoot(document.getElementById("root"));

async function bootstrap() {
  if (isOidcCallback()) {
    try {
      await handleCallback();
    } catch (error) {
      // Never render protected application data after a failed callback.
      clearSession();
      window.history.replaceState({}, document.title, "/auth/callback");
      root.render(
        <main role="alert" style={{ maxWidth: 540, margin: "12vh auto", padding: 24 }}>
          <h1>Não foi possível concluir o login</h1>
          <p>Confira sua sessão no provedor de identidade e tente novamente.</p>
          <p>Detalhe técnico: {error?.message || "OIDC_CALLBACK_FAILED"}</p>
          <a href="/app/">Voltar ao aplicativo</a>
        </main>,
      );
      return;
    }
  }
  root.render(<React.StrictMode><App /></React.StrictMode>);
}

bootstrap();
