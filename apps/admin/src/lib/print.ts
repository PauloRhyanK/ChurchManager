/** Texto vindo de pessoas vai para uma janela com a origem do painel: escapar sempre. */
export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printHtml(html: string) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
