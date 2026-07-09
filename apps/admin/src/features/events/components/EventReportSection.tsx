import { Download, FileSpreadsheet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EventReportDto } from "@/features/events/api/tenant-events-api";
import { formatMoneyCents, orderStatusLabel } from "@/features/events/lib/format";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const registrationsChartConfig = {
  count: { label: "Inscrições", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

type Props = {
  report: EventReportDto;
};

function formatDayLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

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

function exportReportSpreadsheet(report: EventReportDto) {
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

function exportReportPdf(report: EventReportDto) {
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

export function EventReportSection({ report }: Props) {
  const revenueSlices = report.ticketTypes
    .filter((row) => row.revenueCents > 0)
    .map((row) => ({
      name: row.name,
      value: row.revenueCents,
      fill: "",
    }));

  const pieConfig = Object.fromEntries(
    revenueSlices.map((slice, i) => [
      slice.name,
      { label: slice.name, color: PIE_COLORS[i % PIE_COLORS.length] },
    ]),
  ) satisfies ChartConfig;

  const registrationData = report.registrationsByDay.map((row) => ({
    date: formatDayLabel(row.date),
    count: row.count,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportReportSpreadsheet(report)}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar planilha
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportReportPdf(report)}
        >
          <Download className="h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Inscrições por dia</CardTitle>
          </CardHeader>
          <CardContent>
            {registrationData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem inscrições desde a abertura das vendas.
              </p>
            ) : (
              <ChartContainer config={registrationsChartConfig} className="h-[240px] w-full">
                <BarChart data={registrationData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Receita por tipo de ingresso</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueSlices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem receita confirmada por tipo de ingresso.
              </p>
            ) : (
              <ChartContainer config={pieConfig} className="mx-auto h-[240px] w-full max-w-sm">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatMoneyCents(Number(value))}
                      />
                    }
                  />
                  <Pie
                    data={revenueSlices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    strokeWidth={2}
                  >
                    {revenueSlices.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {report.ticketTypes.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Tipos de ingresso</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Vendidos</TableHead>
                  <TableHead>Receita</TableHead>
                  <TableHead>Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.ticketTypes.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{formatMoneyCents(row.priceCents)}</TableCell>
                    <TableCell>{row.quantitySold}</TableCell>
                    <TableCell>{formatMoneyCents(row.revenueCents)}</TableCell>
                    <TableCell>
                      {row.quantityTotal != null
                        ? `${row.quantityRemaining ?? 0} restantes`
                        : "Ilimitado"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report.ordersSummary.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Pedidos por estado</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.ordersSummary.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell>{orderStatusLabel(row.status)}</TableCell>
                    <TableCell>{row.count}</TableCell>
                    <TableCell>{formatMoneyCents(row.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
