import type { EventReportDto } from "@/features/events/api/tenant-events-api";
import { formatMoneyCents, orderStatusLabel } from "@/features/events/lib/format";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportReportSpreadsheet(report: EventReportDto) {
  const rows: string[][] = [
    ["Relatório do evento", report.event.title],
    ["Data do evento", report.event.date],
    [],
    ["Receita confirmada (R$)", (report.confirmedRevenueCents / 100).toFixed(2)],
    ["Bilhetes emitidos", String(report.ticketsIssued)],
    ["Inscrições gratuitas", String(report.registrationCount)],
    [],
    ["Pedidos por estado", "Quantidade", "Total (R$)"],
    ...report.ordersSummary.map((row) => [
      orderStatusLabel(row.status),
      String(row.count),
      (row.totalCents / 100).toFixed(2),
    ]),
    [],
    ["Tipo de ingresso", "Preço (R$)", "Vendidos", "Receita (R$)"],
    ...report.ticketTypes.map((row) => [
      row.name,
      (row.priceCents / 100).toFixed(2),
      String(row.quantitySold),
      (row.revenueCents / 100).toFixed(2),
    ]),
    [],
    ["Data", "Inscrições"],
    ...report.registrationsByDay.map((row) => [row.date, String(row.count)]),
  ];
  downloadCsv(`relatorio-${report.event.id}.csv`, rows);
}

export function exportReportPdf(report: EventReportDto) {
  const ticketRows = report.ticketTypes
    .map(
      (row) =>
        `<tr><td>${row.name}</td><td>${formatMoneyCents(row.priceCents)}</td><td>${row.quantitySold}</td><td>${formatMoneyCents(row.revenueCents)}</td></tr>`,
    )
    .join("");
  const orderRows = report.ordersSummary
    .map(
      (row) =>
        `<tr><td>${orderStatusLabel(row.status)}</td><td>${row.count}</td><td>${formatMoneyCents(row.totalCents)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório — ${report.event.title}</title>
<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style>
</head><body>
<h1>${report.event.title}</h1>
<p>Data do evento: ${report.event.date}</p>
<h2>Resumo</h2>
<ul>
<li>Receita confirmada: ${formatMoneyCents(report.confirmedRevenueCents)}</li>
<li>Bilhetes emitidos: ${report.ticketsIssued}</li>
<li>Inscrições gratuitas: ${report.registrationCount}</li>
</ul>
<h2>Pedidos por estado</h2>
<table><thead><tr><th>Estado</th><th>Qtd</th><th>Total</th></tr></thead><tbody>${orderRows}</tbody></table>
<h2>Por tipo de ingresso</h2>
<table><thead><tr><th>Tipo</th><th>Preço</th><th>Vendidos</th><th>Receita</th></tr></thead><tbody>${ticketRows}</tbody></table>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
