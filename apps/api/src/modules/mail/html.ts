const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa texto de origem não confiável antes de o interpolar em HTML de
 * e-mail. Nomes de participante e títulos de evento vêm de formulários
 * públicos e do painel — nunca devem ser injectados em bruto.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}
