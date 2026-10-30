import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis } from "recharts";
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
