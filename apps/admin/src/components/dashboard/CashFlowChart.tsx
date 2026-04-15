import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { month: "Jan", receitas: 18500, despesas: 12300 },
  { month: "Fev", receitas: 22100, despesas: 14200 },
  { month: "Mar", receitas: 19800, despesas: 11800 },
  { month: "Abr", receitas: 24500, despesas: 15600 },
  { month: "Mai", receitas: 21200, despesas: 13400 },
  { month: "Jun", receitas: 26800, despesas: 16100 },
];

export function CashFlowChart() {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Fluxo de Caixa</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220, 13%, 91%)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR")}`}
              contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            />
            <Bar dataKey="receitas" fill="hsl(252, 56%, 57%)" radius={[6, 6, 0, 0]} name="Receitas" />
            <Bar dataKey="despesas" fill="hsl(220, 14%, 86%)" radius={[6, 6, 0, 0]} name="Despesas" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
