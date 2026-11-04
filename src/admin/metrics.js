// Pure display helpers. Missing telemetry must NEVER be rendered as zero.
export const metricCards = [
  ["users_with_persisted_activity", "Pessoas com registros", "Usuários distintos observados em atividade persistida — não cadastros"],
  ["conversations", "Conversas", "Threads persistidas no tenant"],
  ["messages", "Mensagens", "Mensagens persistidas, sem revelar seu conteúdo"],
  ["completed_readings", "Leituras concluídas", "Registros de progresso concluído"],
  ["bookmarks", "Favoritos", "Versículos salvos"],
  ["sandbox_checkouts", "Checkouts de teste", "Intenções locais, não vendas"],
  ["uncertain_checkouts", "Resultado incerto", "Checkouts que exigem reconciliação"],
  ["active_entitlement_records", "Acessos registrados", "Não equivale a assinantes pagantes"],
  ["reconciliation_attempts", "Tentativas de conciliação", "Histórico técnico local"],
];

export function displayCount(value) {
  return Number.isInteger(value) && value >= 0 ? new Intl.NumberFormat("pt-BR").format(value) : "Não instrumentado";
}
