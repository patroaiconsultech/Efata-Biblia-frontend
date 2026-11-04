import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { metricCards, displayCount } from "./metrics.js";
import "./admin.css";

export default function AdminPanel() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setOverview(await api.adminOverview());
    } catch (err) {
      setOverview(null);
      setError(err.status === 403 ? "Acesso restrito a administradores." :
        err.status === 503 ? "Analytics indisponível neste ambiente; RLS e papel técnico aguardam homologação." :
        "Não foi possível consultar os dados. Verifique a autenticação e a API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  const summary = overview?.summary || {};
  const trend = overview?.message_activity_last_7_days || [];
  const max = Math.max(1, ...trend.map((day) => day.messages));
  return <section className="panel admin-panel" aria-labelledby="admin-heading">
    <div className="admin-intro">
      <div>
        <p className="eyebrow">EfaTÀ 777 · Inteligência operacional</p>
        <h2 id="admin-heading">Painel de gestão</h2>
        <p>Somente dados agregados de desenvolvimento. Sem conteúdo privado, dados de religião ou números financeiros estimados.</p>
      </div>
      <button type="button" className="secondary" disabled={loading} onClick={refresh}>
        {loading ? "Atualizando…" : "Atualizar dados"}
      </button>
    </div>
    {error && <div role="alert" className="error-banner">{error}</div>}
    {overview && <>
      <div className="admin-labels">
        <span>Fonte: SQLite local · tenant autenticado</span>
        <span>Atualizado: {new Date(overview.generated_at).toLocaleString("pt-BR")}</span>
      </div>
      <div className="admin-stats">{metricCards.map(([key, title, description]) =>
        <article className="admin-metric" key={key}>
          <span>{title}</span>
          <strong>{displayCount(summary[key])}</strong>
          <small>{description}</small>
        </article>
      )}</div>
      <div className="admin-detail-grid">
        <article className="admin-detail">
          <h3>Mensagens persistidas · últimos 7 dias</h3>
          <p>Atividade de conversa, não visitas, tokens nem usuários ativos únicos.</p>
          <div className="admin-trend">{trend.map((item) => <div key={item.date} className="admin-trend-day">
            <span className="admin-trend-count">{item.messages}</span>
            <div className="admin-trend-track"><div style={{ height: `${Math.max(4, (item.messages / max) * 100)}%` }} /></div>
            <time dateTime={item.date}>{item.date.slice(5)}</time>
          </div>)}</div>
        </article>
        <article className="admin-detail">
          <h3>Medições ainda não disponíveis</h3>
          <p>Não confundimos falta de telemetria com resultado zero.</p>
          <ul>{Object.entries(overview.unavailable).map(([name, reason]) =>
            <li key={name}><strong>{name.replaceAll("_", " ")}</strong><span>{reason}</span></li>
          )}</ul>
        </article>
      </div>
      <p className="admin-notice" role="note">{overview.notice}</p>
    </>}
    {loading && !overview && <p className="empty-state" role="status">Consultando registros persistidos…</p>}
  </section>;
}
