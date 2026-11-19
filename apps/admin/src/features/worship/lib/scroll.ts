/**
 * Rola só a caixa `container` até `item` ficar visível, sem mexer na página.
 * (`scrollIntoView` rola também a janela e tirava o editor do lugar enquanto
 * a pessoa digitava.)
 */
export function revealInside(container: HTMLElement | null, item: HTMLElement | null | undefined, margin = 4): void {
  if (!container || !item) return;
  const box = container.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  if (rect.top < box.top) container.scrollTop -= box.top - rect.top + margin;
  else if (rect.bottom > box.bottom) container.scrollTop += rect.bottom - box.bottom + margin;
}
