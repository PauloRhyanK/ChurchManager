import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const activities = [
  { name: "Maria Silva", action: "registrou dízimo de R$ 500,00", time: "Há 2h", initials: "MS", color: "bg-violet-100 text-violet-700" },
  { name: "João Pedro", action: "confirmou presença no retiro", time: "Há 3h", initials: "JP", color: "bg-blue-100 text-blue-700" },
  { name: "Ana Costa", action: "se cadastrou como visitante", time: "Há 5h", initials: "AC", color: "bg-emerald-100 text-emerald-700" },
  { name: "Carlos Lima", action: "atualizou escala de louvor", time: "Há 1d", initials: "CL", color: "bg-amber-100 text-amber-700" },
  { name: "Priscila Souza", action: "criou evento: Culto de Oração", time: "Há 1d", initials: "PS", color: "bg-rose-100 text-rose-700" },
];

export function RecentActivity() {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Atividade Recente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-3">
            <Avatar className="h-8 w-8 mt-0.5">
              <AvatarFallback className={`text-xs font-medium ${a.color}`}>
                {a.initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{a.name}</span>{" "}
                <span className="text-muted-foreground">{a.action}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
