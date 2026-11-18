import type { EventRegistrationDto } from "@/features/events/api/tenant-event-registrations-api";
import type { EventParticipantsDto } from "@/features/events/api/tenant-events-api";
import {
  downloadCsv,
  escapeHtml,
  printHtml,
} from "@/features/events/lib/event-report-export";
import { formatDateTime, formatEventDate } from "@/features/events/lib/format";

export function ticketStatusLabel(status: string) {
  const map: Record<string, string> = {
    VALID: "Válido",
    USED: "Utilizado",
    CANCELLED: "Cancelado",
    REFUNDED: "Reembolsado",
  };
  return map[status] ?? status;
}

function fieldLabels(data: EventParticipantsDto) {
  const labels: string[] = [];
  for (const item of data.items) {
    for (const field of item.fields) {
      if (!labels.includes(field.label)) labels.push(field.label);
    }
  }
  return labels;
}

function slug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "evento"
  );
}

/** Uma linha por pessoa: portadores de ingresso e, se houver, inscrições gratuitas. */
export function exportParticipantsSpreadsheet(
  data: EventParticipantsDto,
  registrations: EventRegistrationDto[] = [],
) {
  const labels = fieldLabels(data);
  const header = [
    "Origem",
    "Nome",
    "Tipo de ingresso",
    "Código",
    "Situação",
    "Entrada",
    "Comprador",
    "E-mail",
    "Telefone",
    "Data",
    ...labels,
  ];
  const ticketRows = data.items.map((item) => {
    const values = new Map(item.fields.map((f) => [f.label, f.value]));
    return [
      "Ingresso",
      item.holderName,
      item.ticketTypeName,
      item.publicCode,
      ticketStatusLabel(item.status),
      item.checkedInAt ? formatDateTime(item.checkedInAt) : "",
      item.buyerName ?? "",
      item.buyerEmail ?? "",
      item.buyerPhone ?? "",
      formatDateTime(item.createdAt),
      ...labels.map((label) => values.get(label) ?? ""),
    ];
  });
  const registrationRows = registrations.map((row) => [
    "Inscrição gratuita",
    row.name,
    "",
    "",
    "",
    "",
    "",
    row.email,
    row.phone ?? "",
    formatDateTime(row.createdAt),
    ...labels.map(() => ""),
  ]);
  downloadCsv(`participantes-${slug(data.event.title)}.csv`, [
    header,
    ...ticketRows,
    ...registrationRows,
  ]);
}

/** Lista impressa (ou salva em PDF) com os dados de cada pessoa e espaço para a presença. */
export function exportParticipantsPdf(
  data: EventParticipantsDto,
  registrations: EventRegistrationDto[] = [],
) {
  const ticketRows = data.items
    .map((item, index) => {
      const contact = [item.buyerEmail, item.buyerPhone].filter(Boolean).map(escapeHtml).join("<br>");
      const fields = item.fields
        .map((f) => `<div><b>${escapeHtml(f.label)}:</b> ${escapeHtml(f.value)}</div>`)
        .join("");
      const presence = item.checkedInAt
        ? `Entrou ${escapeHtml(formatDateTime(item.checkedInAt))}`
        : '<span class="box"></span>';
      return `<tr>
<td class="n">${index + 1}</td>
<td><b>${escapeHtml(item.holderName)}</b><div class="muted">${escapeHtml(item.publicCode)}</div></td>
<td>${escapeHtml(item.ticketTypeName)}</td>
<td>${escapeHtml(item.buyerName ?? "—")}<div class="muted">${contact}</div></td>
<td class="small">${fields || "—"}</td>
<td>${escapeHtml(ticketStatusLabel(item.status))}</td>
<td>${presence}</td>
</tr>`;
    })
    .join("");

  const registrationRows = registrations
    .map(
      (row, index) => `<tr>
<td class="n">${index + 1}</td>
<td><b>${escapeHtml(row.name)}</b></td>
<td>${escapeHtml(row.email)}${row.phone ? `<br>${escapeHtml(row.phone)}` : ""}</td>
<td>${escapeHtml(formatDateTime(row.createdAt))}</td>
<td class="small">${row.message ? escapeHtml(row.message) : "—"}</td>
<td><span class="box"></span></td>
</tr>`,
    )
    .join("");

  const checkedIn = data.items.filter((item) => item.checkedInAt).length;
  const title = escapeHtml(data.event.title);

  const ticketsSection = data.items.length
    ? `<h2>Ingressos (${data.items.length})</h2>
<table><thead><tr><th class="n">#</th><th>Participante</th><th>Ingresso</th><th>Comprador</th><th>Dados do formulário</th><th>Situação</th><th>Presença</th></tr></thead>
<tbody>${ticketRows}</tbody></table>`
    : "<h2>Ingressos</h2><p>Nenhum ingresso emitido.</p>";

  const registrationsSection = registrations.length
    ? `<h2>Inscrições gratuitas (${registrations.length})</h2>
<table><thead><tr><th class="n">#</th><th>Nome</th><th>Contato</th><th>Inscrito em</th><th>Mensagem</th><th>Presença</th></tr></thead>
<tbody>${registrationRows}</tbody></table>`
    : "";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Participantes — ${title}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font-family:system-ui,sans-serif;color:#111;font-size:12px;margin:0}
@media screen{body{padding:16px}}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}
p.meta{margin:0;color:#555}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:5px 6px;text-align:left;vertical-align:top}
th{background:#f2f2f2}
tr{page-break-inside:avoid}
thead{display:table-header-group}
.n{width:28px;text-align:right}
.muted{color:#666;font-size:11px}
.small{font-size:11px}
.box{display:inline-block;width:14px;height:14px;border:1px solid #333}
</style>
</head><body>
<h1>${title}</h1>
<p class="meta">Data do evento: ${escapeHtml(formatEventDate(data.event.date))} · Ingressos: ${data.items.length} · Entradas registradas: ${checkedIn}${registrations.length ? ` · Inscrições gratuitas: ${registrations.length}` : ""}</p>
<p class="meta">Gerado em ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
${ticketsSection}
${registrationsSection}
</body></html>`;

  return printHtml(html);
}
