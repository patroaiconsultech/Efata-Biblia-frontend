import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiBaseUrl } from "./api/client.js";
import { consumeBibleStream } from "./sse/stream.js";
import { parseTextUnitId, formatTextUnitReference } from "./lib/references.js";
import { beginLogin, clearSession, hasToken, oidcConfigured } from "./auth/oidc.js";
import "./styles.css";
import AdminPanel from "./admin/AdminPanel.jsx";

const tabs = [
  ["reader", "Leitor"],
  ["search", "Busca"],
  ["journey", "Jornada"],
  ["saved", "Salvos"],
  ["journal", "Diário"],
  ["guide", "Guia da Palavra"],
  ["faith", "Minha fé"],
  ["plans", "Planos"],
];

function AuthControl({ onLogout }) {
  return <button className="text-button auth-button" type="button" onClick={onLogout}>Sair da conta</button>;
}

function NativeAccess({ onAuthenticated }) {
  const queryToken = new URLSearchParams(window.location.search).get("reset_token") || "";
  const [mode, setMode] = useState(queryToken ? "resetConfirm" : "login");
  const [resetToken, setResetToken] = useState(queryToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [capabilities, setCapabilities] = useState({ registration_enabled: false, password_reset_enabled: false });
  useEffect(() => {
    api.authStatus().then(setCapabilities).catch(() => setCapabilities({ registration_enabled: false, password_reset_enabled: false }));
  }, []);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (queryToken) window.history.replaceState({}, document.title, "/app/");
  }, []);
  async function submit(event) {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    try {
      if (mode === "login") {
        await api.login(email, password);
        onAuthenticated(await api.authSession());
      } else if (mode === "register") {
        await api.register(email, password);
        setMode("login"); setPassword("");
        setMessage("Conta criada. Entre com seu e-mail e senha.");
      } else if (mode === "resetRequest") {
        await api.resetRequest(email);
        setMessage("Se houver conta com esse e-mail, você receberá instruções.");
      } else if (mode === "resetConfirm") {
        await api.resetConfirm(resetToken, password);
        setResetToken(""); setPassword(""); setMode("login");
        setMessage("Senha redefinida. Entre na sua conta.");
      }
    } catch (err) {
      setError(err.code === "BIBLE_REGISTRATION_DISABLED" ? "Cadastro temporariamente indisponível."
        : err.code === "BIBLE_LOGIN_INVALID" ? "E-mail ou senha incorretos."
        : err.code === "BIBLE_PASSWORD_RESET_UNAVAILABLE" ? "Recuperação ainda não habilitada."
        : err.code === "BIBLE_LOGIN_RATE_LIMITED" ? "Muitas tentativas. Tente novamente mais tarde."
        : err.message || "Não foi possível concluir a operação.");
    } finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-panel" aria-labelledby="auth-title">
      <a href="/">← Voltar ao início</a>
      <h1 id="auth-title">EfaTÀ 777 · Bíblia</h1>
      <p>Uma conta própria para sua leitura, seus registros e seu caminho de fé.</p>
      <h2>{mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : mode === "resetRequest" ? "Recuperar senha" : "Definir nova senha"}</h2>
      <form onSubmit={submit}>
        {mode !== "resetConfirm" && <label>E-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
        {mode !== "resetRequest" && <label>{mode === "resetConfirm" ? "Nova senha" : "Senha"}<input type="password" minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        {mode === "resetConfirm" && <label>Código de recuperação<input value={resetToken} required onChange={(event) => setResetToken(event.target.value)} /></label>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="primary" disabled={busy} type="submit">{busy ? "Processando…" : mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : mode === "resetRequest" ? "Enviar instruções" : "Redefinir senha"}</button>
      </form>
      <nav className="auth-navigation" aria-label="Conta">
        {mode !== "login" && <button type="button" className="text-button" onClick={() => { setMode("login"); setError(""); }}>Já tenho uma conta</button>}
        {capabilities.registration_enabled && mode !== "register" && <button type="button" className="text-button" onClick={() => { setMode("register"); setError(""); }}>Criar conta</button>}
        {capabilities.password_reset_enabled && mode !== "resetRequest" && <button type="button" className="text-button" onClick={() => { setMode("resetRequest"); setError(""); }}>Esqueci a senha</button>}
      </nav>
    </section>
  </main>;
}

function ErrorBanner({ error }) {
  if (!error) return null;
  return <div className="error-banner" role="alert">{error.message || String(error)}</div>;
}

function SourceBadge() {
  return <div className="source-badge"><span className="dot" />Bíblia Livre · versão 2025.1.0 · <a href="https://github.com/blivre/BibliaLivre" target="_blank" rel="noreferrer">fonte e licença</a></div>;
}

function Reader({ works, selectedWork, setSelectedWork, selectedChapter, setSelectedChapter, chapter, loading, onLoad, progress, onProgress, bookmarks, highlights, onToggleBookmark, onAddHighlight, canPersonalize, focusedUnitId }) {
  const [highlightTarget, setHighlightTarget] = useState(null);
  const [highlightNote, setHighlightNote] = useState("");
  const [highlightColor, setHighlightColor] = useState("gold");
  return <section className="panel reader-panel" aria-labelledby="reader-title">
    <div className="panel-heading">
      <div><p className="eyebrow">Leitura determinística</p><h2 id="reader-title">Encontre espaço para a Palavra</h2><p className="muted">Leia o texto identificado no corpus local sem depender de IA ou do ORKIO.</p></div>
      <div className="reader-controls">
        <label>Livro<select value={selectedWork} onChange={(event) => setSelectedWork(event.target.value)}>{works.map((work) => <option key={work.work_id} value={work.work_id}>{work.title}</option>)}</select></label>
        <label>Capítulo<input type="number" min="1" value={selectedChapter} onChange={(event) => setSelectedChapter(event.target.value)} /></label>
        <button className="primary" onClick={onLoad} disabled={loading}>Ler</button>
      </div>
    </div>
    {loading ? <div className="empty-state">Carregando capítulo…</div> : chapter ? <>
      <SourceBadge />
      <div className="chapter-head"><span>{works.find((work) => work.work_id === chapter.work_id)?.title || selectedWork} · capítulo {chapter.chapter}</span><span>{chapter.units.length} versículos</span></div>
      <div className="verse-list">{chapter.units.map((unit) => {
        const isBookmarked = bookmarks.includes(unit.text_unit_id);
        const unitHighlights = highlights.filter((item) => item.text_unit_id === unit.text_unit_id);
        return <article id={`unit-${unit.text_unit_id}`} tabIndex={-1} className={`verse ${focusedUnitId === unit.text_unit_id ? "verse-focused" : ""} ${unitHighlights.length ? "verse-highlighted" : ""}`} key={unit.text_unit_id}>
          <div className="verse-number">{unit.verse}</div>
          <div className="verse-main"><p>{unit.text}</p>
            <div className="verse-actions">
              <button type="button" className="small-action" aria-pressed={isBookmarked} disabled={!canPersonalize} onClick={() => onToggleBookmark(unit.text_unit_id, !isBookmarked)}>{isBookmarked ? "★ Salvo" : "☆ Favoritar"}</button>
              <button type="button" className="small-action" disabled={!canPersonalize} aria-expanded={highlightTarget === unit.text_unit_id} onClick={() => { setHighlightTarget(highlightTarget === unit.text_unit_id ? null : unit.text_unit_id); setHighlightNote(""); }}>
                {unitHighlights.length ? `✎ Destacar (${unitHighlights.length})` : "✎ Destacar"}
              </button>
              <label className="verse-check"><input type="checkbox" checked={Boolean(progress[unit.text_unit_id])} disabled={!canPersonalize} onChange={(event) => onProgress(unit.text_unit_id, event.target.checked)} />Lido</label>
            </div>
            {highlightTarget === unit.text_unit_id && <form className="highlight-form" onSubmit={async (event) => {
              event.preventDefault();
              const success = await onAddHighlight(unit.text_unit_id, highlightNote.trim(), highlightColor);
              if (success) { setHighlightTarget(null); setHighlightNote(""); }
            }}>
              <label>Nota opcional<textarea value={highlightNote} maxLength="2000" onChange={(event) => setHighlightNote(event.target.value)} rows="2" placeholder="Sua observação (privada)" /></label>
              <label>Cor<select value={highlightColor} onChange={(event) => setHighlightColor(event.target.value)}><option value="gold">Dourado</option><option value="teal">Verde-água</option><option value="blue">Azul</option><option value="rose">Rosa</option></select></label>
              <button type="submit" className="secondary">Salvar destaque</button>
            </form>}
          </div>
        </article>;
      })}</div>
      <p className="attribution">Texto: Bíblia Livre (BLIVRE), autores Diego Santos, Mario Sérgio e Marco Teles. Licença Creative Commons Atribuição 3.0 Brasil. Preserve a atribuição e a versão ao redistribuir.</p>
    </> : <div className="empty-state">Escolha um livro e capítulo para começar.</div>}
  </section>;
}

function SearchPanel({ onSearch, results, loading, query, setQuery, onOpenResult }) {
  return <section className="panel" aria-labelledby="search-title"><div className="panel-heading"><div><p className="eyebrow">Busca no corpus</p><h2 id="search-title">Procure por palavra ou referência</h2></div></div>
    <form className="search-row" onSubmit={(event) => { event.preventDefault(); onSearch(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: Gn.1.1 ou princípio" aria-label="Termo de busca" /><button className="primary" type="submit">Buscar</button></form>
    {loading ? <div className="empty-state">Buscando…</div> : <div className="results">{results.length ? results.map((result) => <article className="result-card" key={result.text_unit_id}><strong>{result.reference}</strong><p>{result.text}</p><small>Bíblia Livre · {result.source_version}</small><button className="small-action" onClick={() => onOpenResult(result.text_unit_id)}>Abrir no leitor</button></article>) : <div className="empty-state">Nenhum resultado ainda.</div>}</div>}
  </section>;
}

function SavedPanel({ bookmarks, highlights, works, onOpen, onRemoveBookmark, onRemoveHighlight, canPersonalize }) {
  return <section className="panel" aria-labelledby="saved-title">
    <div className="panel-heading"><div><p className="eyebrow">Minha biblioteca</p><h2 id="saved-title">Favoritos e destaques</h2><p className="muted">Seus registros pertencem à sua conta. O conteúdo bíblico continua vinculado à fonte original.</p></div></div>
    {!canPersonalize && <p className="empty-state">Entre na sua conta para guardar favoritos e destaques.</p>}
    <h3>Favoritos ({bookmarks.length})</h3>
    <div className="saved-grid">{bookmarks.map((id) => <article className="result-card" key={id}>
      <strong>{formatTextUnitReference(id, works)}</strong>
      <div className="saved-actions"><button className="small-action" onClick={() => onOpen(id)}>Abrir no leitor</button><button className="text-button" onClick={() => onRemoveBookmark(id)}>Remover</button></div>
    </article>)}{!bookmarks.length && <p className="muted">Nenhum versículo favorito ainda.</p>}</div>
    <h3>Destaques ({highlights.length})</h3>
    <div className="saved-grid">{highlights.map((item) => <article className="result-card" key={item.highlight_id}>
      <strong>{formatTextUnitReference(item.text_unit_id, works)}</strong>
      <span className={`highlight-color color-${item.color}`}>{item.color}</span>
      {item.note && <p>{item.note}</p>}
      <div className="saved-actions"><button className="small-action" onClick={() => onOpen(item.text_unit_id)}>Abrir no leitor</button><button className="text-button" onClick={() => onRemoveHighlight(item.highlight_id)}>Excluir destaque</button></div>
    </article>)}{!highlights.length && <p className="muted">Nenhum destaque salvo ainda.</p>}</div>
  </section>;
}

function JourneyPanel({ progress, works, onStart }) {
  const completed = Object.values(progress).filter(Boolean).length;
  return <section className="panel journey" aria-labelledby="journey-title"><p className="eyebrow">Jornada diária</p><h2 id="journey-title">Um ritmo possível, sem culpa</h2><p className="lead">A leitura não é uma prova de desempenho. Hoje, escolha um trecho, observe o contexto e leve uma pergunta honesta com você.</p>
    <div className="journey-grid"><div className="journey-card highlight"><span className="card-icon">01</span><h3>Palavra do Dia</h3><p>Leia um capítulo curto, anote uma observação e escolha uma ação pequena e concreta.</p><button className="secondary" onClick={onStart}>Começar hoje</button></div><div className="journey-card"><span className="card-icon">02</span><h3>Seu progresso</h3><p>{completed ? `${completed} unidade(s) marcada(s) como lida(s).` : "Marque suas unidades lidas para construir um histórico gentil."}</p><div className="progress-bar"><span style={{ width: `${Math.min(100, completed * 5)}%` }} /></div></div><div className="journey-card"><span className="card-icon">03</span><h3>Planos em preparação</h3><p>Planos por tema, tradição e tempo serão adicionados com fontes e direitos registrados.</p><span className="tag">Em breve</span></div></div>
    <div className="small-note">{works.length} obras disponíveis no corpus atual. O perfil canônico permanece visível e pode ser ampliado com novos `RightsRecord`.</div>
  </section>;
}

function JournalPanel({ entries, onCreate, onDelete, loading }) {
  const [content, setContent] = useState("");
  const [kind, setKind] = useState("journal");
  const submit = async (event) => { event.preventDefault(); if (!content.trim()) return; if (await onCreate(content.trim(), kind)) setContent(""); };
  return <section className="panel" aria-labelledby="journal-title"><p className="eyebrow">Espaço privado</p><h2 id="journal-title">Diário e oração</h2><p className="muted">Seu texto é armazenado cifrado no backend. Não escreva informações que não deseja manter neste ambiente de demonstração.</p>
    <form className="journal-form" onSubmit={submit}><div className="inline-fields"><label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="journal">Diário</option><option value="prayer">Oração</option><option value="reflection">Reflexão</option></select></label><span className="encryption-label">● cifrado · chave v1</span></div><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="O que você gostaria de registrar?" rows="5" maxLength="20000" /><button className="primary" disabled={loading}>{loading ? "Salvando…" : "Guardar no espaço privado"}</button></form>
    <div className="entry-list">{entries.map((entry) => <article className="entry-card" key={entry.entry_id}><div><span className="tag">{entry.kind}</span><time>{new Date(entry.created_at).toLocaleString("pt-BR")}</time></div><p>{entry.content}</p><button className="text-button" onClick={() => onDelete(entry.entry_id)}>Excluir</button></article>)}{!entries.length && <div className="empty-state">Nenhum registro ainda.</div>}</div>
  </section>;
}

const traditionOptions = [
  ["catholic", "Católica"],
  ["evangelical", "Evangélica"],
  ["protestant", "Protestante (outras vertentes)"],
  ["orthodox", "Ortodoxa"],
  ["other_christian", "Outra tradição cristã"],
  ["jewish", "Judaica"],
  ["other", "Outra tradição religiosa"],
  ["none", "Sem vínculo religioso"],
];

function FaithPreferencesPanel({ canPersonalize, preference, onSave, onDelete, onSkip, busy }) {
  const [tradition, setTradition] = useState(preference?.tradition || "");
  const [style, setStyle] = useState(preference?.study_style || "ecumenical");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    setTradition(preference?.tradition || "");
    setStyle(preference?.study_style || "ecumenical");
    setConsent(false);
  }, [preference?.tradition, preference?.study_style]);

  return <section className="panel" aria-labelledby="faith-title">
    <p className="eyebrow">Um espaço para todas as tradições</p>
    <h2 id="faith-title">Como você prefere estudar a Bíblia?</h2>
    <p className="muted">Sua fé merece respeito. Se quiser, informe sua tradição para que o Guia da Palavra apresente os estudos com mais contexto. Você pode deixar em branco, alterar ou apagar essa preferência a qualquer momento.</p>
    <p className="canon-notice"><strong>Transparência editorial:</strong> nesta versão o leitor contém uma tradução identificada com 66 livros. A edição católica completa (73 livros, inclusive deuterocanônicos e acréscimos de Daniel e Ester) e outras tradições canônicas ainda dependem de conteúdo licenciado e revisão editorial. Escolher uma tradição não altera os textos disponíveis.</p>
    {!canPersonalize ? <div className="empty-state">Entre na sua conta para guardar preferências. A leitura gratuita permanece disponível sem cadastro.</div> :
    <form className="faith-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!tradition || !consent) return;
      if (await onSave(tradition, style)) setConsent(false);
    }}>
      <label>1. Qual tradição descreve melhor sua relação com a fé?
        <select value={tradition} onChange={(event) => setTradition(event.target.value)} required disabled={busy}>
          <option value="">Selecione, se desejar</option>
          {traditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>2. Como prefere que o Guia apresente as explicações?
        <select value={style} onChange={(event) => setStyle(event.target.value)} disabled={busy}>
          <option value="ecumenical">Perspectiva ecumênica e neutra</option>
          <option value="my_tradition">Considerar minha tradição (quando houver fontes verificadas)</option>
          <option value="compare">Comparar tradições com respeito e fontes</option>
        </select>
      </label>
      <label className="faith-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
        <span><strong>Autorizo o uso desta preferência religiosa para personalizar os estudos do Guia.</strong> Entendo que é um dado sensível, guardado de forma criptografada na conta da Bíblia; não será usado para cobrança, anúncios nem compartilhado com a ORKIO. Posso retirar esse consentimento apagando a preferência.</span>
      </label>
      <div className="faith-actions">
        <button className="primary" type="submit" disabled={busy || !tradition || !consent}>{busy ? "Salvando…" : "Salvar minha preferência"}</button>
        {preference && <button className="secondary" type="button" disabled={busy} onClick={onDelete}>Apagar preferência e retirar consentimento</button>}
        <button className="text-button" type="button" disabled={busy} onClick={onSkip}>Agora não</button>
      </div>
      <p className="small-note">Não escolher nenhuma opção não reduz o acesso gratuito. O Guia é determinístico nesta versão e não possui uma biblioteca completa de comentários denominacionais.</p>
    </form>}
  </section>;
}

function PlansPanel() {
  const [catalog, setCatalog] = useState(null);
  const [access, setAccess] = useState(null);
  const [failure, setFailure] = useState("");
  const [checkoutPending, setCheckoutPending] = useState("");
  const [sandboxLink, setSandboxLink] = useState(null);
  const checkoutKeys = useRef({});
  const sandboxAvailable = catalog?.checkout_enabled === true && import.meta.env.MODE !== "production";
  const requestSandboxCheckout = async (planCode) => {
    if (!sandboxAvailable || checkoutPending) return;
    setFailure("");
    setSandboxLink(null);
    setCheckoutPending(planCode);
    const key = checkoutKeys.current[planCode] ||
      `test_${(globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`).replaceAll("-", "_")}`;
    checkoutKeys.current[planCode] = key;
    try {
      const answer = await api.createSandboxCheckout(planCode, key);
      if (answer?.status !== "awaiting_payment" || !answer.payment_url) throw new Error("Checkout sandbox sem confirmação");
      setSandboxLink({ planCode, url: answer.payment_url });
    } catch (error) {
      setFailure(error.message || "Falha no checkout de teste. Verifica o estado antes de tentar novamente.");
    } finally {
      setCheckoutPending("");
    }
  };
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.billingPlans(),
      (import.meta.env.MODE !== "production" || hasToken()) ? api.billingMe() : Promise.resolve(null),
    ]).then(([plansResult, accessResult]) => {
      if (!active) return;
      if (plansResult.status === "fulfilled") setCatalog(plansResult.value);
      else setFailure("O catálogo ainda não está disponível.");
      if (accessResult.status === "fulfilled") setAccess(accessResult.value);
    });
    return () => { active = false; };
  }, []);
  return <section className="panel" aria-labelledby="plans-title">
    <p className="eyebrow">Acesso e sustentabilidade</p>
    <h2 id="plans-title">Planos da Bíblia Sagrada</h2>
    <p className="muted">A leitura essencial da Bíblia permanece gratuita. Recursos premium serão habilitados somente após a validação jurídica e financeira.</p>
    <div className="billing-status">
      <strong>Plano atual: {access?.plan_code || "gratuito"}</strong>
      <span>{sandboxAvailable ? "Checkout sandbox local habilitado — sem cobrança comercial" : "Pagamentos ainda não habilitados"}</span>
    </div>
    {failure && <p role="alert" className="error-banner">{failure}</p>}
    <div className="billing-grid">
      <article className="billing-card">
        <span className="tag">Disponível</span><h3>Leitura gratuita</h3><p>Leitor e acesso ao conteúdo autorizado, sem assinatura obrigatória.</p><strong>R$ 0,00</strong>
      </article>
      {(catalog?.items || []).map((plan) => <article className="billing-card" key={plan.code}>
        <span className="tag">Planejado</span><h3>{plan.name}</h3>
        <strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(plan.price_brl))}</strong>
        <p>Período de acesso: {plan.access_days} dias</p>
        <ul>{plan.features.map((feature, i) => <li key={i}>{feature}</li>)}</ul>
        <button type="button" disabled={!sandboxAvailable || Boolean(checkoutPending)} aria-disabled={!sandboxAvailable} title={sandboxAvailable ? "Checkout exclusivo do ambiente sandbox" : "Pagamento ainda não habilitado"} onClick={() => requestSandboxCheckout(plan.code)}>
          {checkoutPending === plan.code ? "Criando link de teste…" : sandboxAvailable ? "Gerar link sandbox" : "Em preparação"}
        </button>
      </article>)}
    </div>
    {sandboxLink && <p className="small-note" role="status">Link criado somente para teste: <a href={sandboxLink.url} target="_blank" rel="noopener noreferrer">Abrir checkout Asaas sandbox ({sandboxLink.planCode})</a>. Não representa assinatura ativa.</p>}
    {!catalog && !failure && <p className="muted">Consultando catálogo...</p>}
    <p className="small-note">Nenhuma cobrança comercial está disponível nesta versão. Os preços são propostas e o uso de IA não possui cota final definida. Dados da ORKIO e da Bíblia permanecem separados.</p>
  </section>;
}

const guideModes = [
  ["SCRIPTURE_EXPLANATION", "Explicação bíblica"],
  ["THEMATIC_STUDY", "Estudo temático"],
  ["PERSONAL_REFLECTION", "Reflexão"],
  ["PRAYER_ASSISTANCE", "Oração opcional"],
];
const blockLabels = {
  SCRIPTURE_QUOTE: "Texto bíblico • fonte identificada",
  HISTORICAL_TEXT: "Texto histórico não canônico",
  HISTORICAL_CONTEXT: "Contexto histórico",
  INTERPRETATION: "Orientação de estudo",
  AI_REFLECTION: "Reflexão assistida",
  APPLICATION: "Aplicação possível",
  PRAYER_SUGGESTION: "Oração sugerida",
  SAFETY_NOTICE: "Limite de segurança",
};
function GuidePanel({ blocks, status, onSubmit, onCancel }) {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState("SCRIPTURE_EXPLANATION");
  const submit = async (event) => { event.preventDefault(); if (!content.trim()) return; if (await onSubmit(content.trim(), mode)) setContent(""); };
  return <section className="panel guide" aria-labelledby="guide-title"><div className="panel-heading"><div><p className="eyebrow">Assistência responsável</p><h2 id="guide-title">Guia da Palavra</h2><p className="muted">Versão determinística de estudo: não gera profecias e não possui ainda pesquisa histórica ou modelo de IA conectado. Escolha um modo ou escreva sua pergunta.</p></div><span className={`status-pill ${status === "streaming" ? "live" : ""}`}>{status === "streaming" ? "respondendo" : status === "done" ? "concluído" : "pronto"}</span></div>
    <div className="guide-output" aria-live="polite">{blocks.length ? blocks.map((block, index) => <article className={`guide-block ${block.block_type.toLowerCase()}`} key={`${block.block_type}-${index}`}><span>{blockLabels[block.block_type] || block.block_type.replaceAll("_", " ")}</span><p>{block.content}</p>{block.citations?.map((citation) => <small key={citation.citation_id}>Fonte: {citation.display_label}</small>)}</article>) : <div className="empty-state">Ex.: “Explique Gênesis 1:1”</div>}</div>
    <form className="guide-form" onSubmit={submit}><label className="guide-mode-label">Como deseja conversar?
      <select aria-label="Modo do Guia" value={mode} onChange={(event) => setMode(event.target.value)} disabled={status === "streaming"}>
        {guideModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Escreva sua pergunta…" rows="3" disabled={status === "streaming"} /><div className="guide-actions"><span className="small-note">SSE `bible.sse.v1` · `done` obrigatório</span>{status === "streaming" ? <button type="button" className="secondary" onClick={onCancel}>Cancelar</button> : <button className="primary">Enviar pergunta</button>}</div></form>
  </section>;
}

function BibleWorkspace({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState("reader");
  const [isAdmin] = useState(session.role === "admin");
  const [works, setWorks] = useState([]);
  const [selectedWork, setSelectedWork] = useState("work_gen");
  const [selectedChapter, setSelectedChapter] = useState("1");
  const [chapter, setChapter] = useState(null);
  const [progress, setProgress] = useState({});
  const [bookmarks, setBookmarks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [focusedUnitId, setFocusedUnitId] = useState(null);
  const canPersonalize = true;
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guideBlocks, setGuideBlocks] = useState([]);
  const [guideStatus, setGuideStatus] = useState("ready");
  const [faithPreference, setFaithPreference] = useState(null);
  const [faithLoaded, setFaithLoaded] = useState(false);
  const [faithBusy, setFaithBusy] = useState(false);
  const [faithPromptDismissed, setFaithPromptDismissed] = useState(false);
  const controller = useRef(null);

  const selectedTitle = useMemo(() => works.find((item) => item.work_id === selectedWork)?.title || "Bíblia", [works, selectedWork]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const workData = await api.works();
        if (cancelled) return;
        setWorks(workData);
        if (canPersonalize) {
          const [progressData, journalData, bookmarkData, highlightData] = await Promise.all([
            api.progress(), api.journal(), api.bookmarks(), api.highlights(),
          ]);
          if (cancelled) return;
          setProgress(Object.fromEntries(progressData.items.map((item) => [item.text_unit_id, item.completed])));
          setEntries(journalData.items);
          setBookmarks(bookmarkData.text_unit_ids);
          setHighlights(highlightData.items);
        }
      } catch (err) { if (!cancelled) setError(err); }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let active = true;
    if (!canPersonalize) { setFaithLoaded(true); return undefined; }
    api.faithPreference().then((result) => {
      if (active) setFaithPreference(result.preference);
    }).catch(() => {
      // Do not interrupt scripture reading if optional preferences are unavailable.
    }).finally(() => { if (active) setFaithLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!works.length) return; loadChapter(); }, [works.length]);
  useEffect(() => {
    if (activeTab !== "reader" || !chapter || !focusedUnitId || !chapter.units.some((unit) => unit.text_unit_id === focusedUnitId)) return;
    const target = document.getElementById(`unit-${focusedUnitId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }, [activeTab, chapter, focusedUnitId]);

  async function loadChapter() { setLoading(true); setError(null); try { setChapter(await api.chapter(selectedWork, Number(selectedChapter))); setFocusedUnitId(null); } catch (err) { setError(err); } finally { setLoading(false); } }
  async function markProgress(textUnitId, completed) {
    setError(null);
    try {
      await api.saveProgress(textUnitId, completed);
      setProgress((current) => ({ ...current, [textUnitId]: completed }));
    } catch (err) { setError(err); }
  }
  async function toggleBookmark(textUnitId, active) {
    setError(null);
    try {
      await api.setBookmark(textUnitId, active);
      setBookmarks((current) => active ? [...new Set([...current, textUnitId])] : current.filter((id) => id !== textUnitId));
    } catch (err) { setError(err); }
  }
  async function addHighlight(textUnitId, note, color) {
    setError(null);
    try {
      await api.createHighlight(textUnitId, note, color);
      setHighlights((await api.highlights()).items);
      return true;
    } catch (err) { setError(err); return false; }
  }
  async function deleteHighlight(highlightId) {
    setError(null);
    try {
      await api.deleteHighlight(highlightId);
      setHighlights((current) => current.filter((item) => item.highlight_id !== highlightId));
    } catch (err) { setError(err); }
  }
  async function openTextUnit(textUnitId) {
    const target = parseTextUnitId(textUnitId);
    if (!target || !works.some((item) => item.work_id === target.workId)) {
      setError(new Error("Referência indisponível no catálogo atual."));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const requestedChapter = await api.chapter(target.workId, target.chapter);
      if (!requestedChapter.units.some((unit) => unit.text_unit_id === textUnitId)) throw new Error("O versículo não foi encontrado na fonte.");
      setSelectedWork(target.workId);
      setSelectedChapter(String(target.chapter));
      setChapter(requestedChapter);
      setFocusedUnitId(textUnitId);
      setActiveTab("reader");
    } catch (err) { setError(err); } finally { setLoading(false); }
  }
  async function search() { setLoading(true); setError(null); try { const data = await api.search(searchQuery); setResults(data.results); setActiveTab("search"); } catch (err) { setError(err); } finally { setLoading(false); } }
  async function startDailyJourney() {
    setLoading(true);
    setError(null);
    try {
      const journey = await api.today();
      const reference = /^Gn\.(\d+)\.(\d+)$/.exec(journey.suggested_reference || "");
      if (!reference) throw new Error("A referência diária ainda não está disponível no leitor.");
      const chapterNumber = Number(reference[1]);
      const dailyChapter = await api.chapter("work_gen", chapterNumber);
      setSelectedWork("work_gen");
      setSelectedChapter(String(chapterNumber));
      setChapter(dailyChapter);
      setFocusedUnitId(null);
      setActiveTab("reader");
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  async function createJournal(content, kind) {
    setLoading(true); setError(null);
    try { await api.createJournal(content, kind); setEntries((await api.journal()).items); return true; }
    catch (err) { setError(err); return false; }
    finally { setLoading(false); }
  }
  async function deleteJournal(entryId) { try { await api.deleteJournal(entryId); setEntries((await api.journal()).items); } catch (err) { setError(err); } }
  async function askGuide(content, mode = "SCRIPTURE_EXPLANATION") {
    controller.current = new AbortController();
    setGuideBlocks([]); setGuideStatus("streaming"); setError(null);
    let success = false;
    try {
      await consumeBibleStream("main", content, mode, (type, event) => {
        if (type === "content.delta") setGuideBlocks((current) => [...current, {
          block_type: event.payload.block_type, content: event.payload.delta, citations: event.payload.citations || [],
        }]);
        if (type === "error") setError(new Error(event.payload.message || event.payload.code || "Erro no Guia da Palavra."));
        if (type === "done") {
          success = event.payload.outcome === "success";
          setGuideStatus(success ? "done" : "ready");
        }
      }, controller.current.signal);
    } catch (err) {
      if (err.name !== "AbortError") setError(err);
      setGuideStatus("ready");
    } finally { controller.current = null; }
    return success;
  }
  function cancelGuide() { controller.current?.abort(); setGuideStatus("ready"); }
  async function saveFaithPreference(tradition, studyStyle) {
    setFaithBusy(true); setError(null);
    try {
      const result = await api.saveFaithPreference(tradition, studyStyle);
      setFaithPreference(result.preference);
      setFaithPromptDismissed(true);
      return true;
    } catch (err) { setError(err); return false; }
    finally { setFaithBusy(false); }
  }
  async function deleteFaithPreference() {
    setFaithBusy(true); setError(null);
    try {
      await api.deleteFaithPreference();
      setFaithPreference(null);
      setFaithPromptDismissed(true);
    } catch (err) { setError(err); }
    finally { setFaithBusy(false); }
  }

  return <div className="app-shell"><header className="topbar"><div className="brand-mark"><span className="brand-symbol">✦</span><div><strong>EfaTÀ 777</strong><small>Bíblia digital · em desenvolvimento</small></div></div><div className="top-meta"><AuthControl onLogout={onLogout} /><span className="secure-mark">● sessão nativa</span><span className="api-mark">API {apiBaseUrl()}</span></div></header><main className="content"><section className="hero"><div><p className="eyebrow">Leitura · estudo · presença</p><h1>Uma biblioteca viva para <em>caminhar</em> com o texto.</h1><p>Leia com fonte, contexto e liberdade. A plataforma separa Escritura, história, interpretação e reflexão pessoal.</p></div><div className="hero-card"><span className="hero-card-label">Hoje</span><strong>{selectedTitle}</strong><span>Capítulo {selectedChapter}</span><button className="secondary" onClick={() => setActiveTab("reader")}>Abrir leitura</button></div></section><nav className="tabbar" aria-label="Navegação principal">{[...tabs, ...(isAdmin ? [["admin", "Gestão"]] : [])].map(([id, label]) => <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}</nav><ErrorBanner error={error} />{canPersonalize && faithLoaded && !faithPreference && !faithPromptDismissed && activeTab !== "faith" && <div className="faith-invite" role="region" aria-label="Personalização opcional"><span><strong>Seu caminho de fé, seu jeito de estudar.</strong> Quer nos contar sua tradição? É opcional.</span><button type="button" className="secondary" onClick={() => setActiveTab("faith")}>Personalizar estudo</button><button type="button" className="text-button" onClick={() => setFaithPromptDismissed(true)}>Agora não</button></div>}{activeTab === "reader" && <Reader works={works} selectedWork={selectedWork} setSelectedWork={setSelectedWork} selectedChapter={selectedChapter} setSelectedChapter={setSelectedChapter} chapter={chapter} loading={loading} onLoad={loadChapter} progress={progress} onProgress={markProgress} bookmarks={bookmarks} highlights={highlights} onToggleBookmark={toggleBookmark} onAddHighlight={addHighlight} canPersonalize={canPersonalize} focusedUnitId={focusedUnitId} />}{activeTab === "search" && <SearchPanel onSearch={search} results={results} loading={loading} query={searchQuery} setQuery={setSearchQuery} onOpenResult={openTextUnit} />}{activeTab === "journey" && <JourneyPanel progress={progress} works={works} onStart={startDailyJourney} />}{activeTab === "saved" && <SavedPanel bookmarks={bookmarks} highlights={highlights} works={works} onOpen={openTextUnit} onRemoveBookmark={(id) => toggleBookmark(id, false)} onRemoveHighlight={deleteHighlight} canPersonalize={canPersonalize} />}{activeTab === "journal" && <JournalPanel entries={entries} onCreate={createJournal} onDelete={deleteJournal} loading={loading} />}{activeTab === "guide" && <GuidePanel blocks={guideBlocks} status={guideStatus} onSubmit={askGuide} onCancel={cancelGuide} />}{activeTab === "faith" && <FaithPreferencesPanel canPersonalize={canPersonalize} preference={faithPreference} onSave={saveFaithPreference} onDelete={deleteFaithPreference} onSkip={() => { setFaithPromptDismissed(true); setActiveTab("reader"); }} busy={faithBusy} />}{activeTab === "plans" && <PlansPanel />}{activeTab === "admin" && isAdmin && <AdminPanel />}</main><footer><span>EfaTÀ 777 · RC 0.12 desenvolvimento</span><span>Fonte: Bíblia Livre · <a href="https://creativecommons.org/licenses/by/3.0/br/" target="_blank" rel="noreferrer">CC BY 3.0 BR</a></span></footer></div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  useEffect(() => {
    let active = true;
    api.authSession().then((context) => { if (active) setSession(context); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { if (active) setLoadingSession(false); });
    return () => { active = false; };
  }, []);
  async function logout() {
    try { await api.logout(); }
    catch (error) {
      window.alert(`Não foi possível encerrar a sessão: ${error.message}`);
      return;
    }
    setSession(null);
  }
  if (loadingSession) return <main className="auth-page"><p>Verificando sua sessão…</p></main>;
  if (!session) return <NativeAccess onAuthenticated={setSession} />;
  return <BibleWorkspace key={session.user_id} session={session} onLogout={logout} />;
}
