import { CalendarDays, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const events = [
  { title: "Culto Dominical", date: "Dom, 20 Abr", time: "09:00", location: "Templo Principal", type: "Culto" },
  { title: "Reunião de Líderes", date: "Ter, 22 Abr", time: "19:30", location: "Sala 3", type: "Reunião" },
  { title: "Retiro de Jovens", date: "Sáb, 26 Abr", time: "08:00", location: "Sítio Esperança", type: "Retiro" },
  { title: "Culto de Oração", date: "Qua, 23 Abr", time: "19:00", location: "Templo Principal", type: "Culto" },
];

const typeColors: Record<string, string> = {
  Culto: "bg-violet-100 text-violet-700",
  Reunião: "bg-blue-100 text-blue-700",
  Retiro: "bg-emerald-100 text-emerald-700",
};

export function UpcomingEvents() {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Próximos Eventos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((e, i) => (
          <div key={i} className="flex items-start gap-4 rounded-lg border border-border/50 p-3 hover:bg-secondary/30 transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{e.title}</p>
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeColors[e.type] || ""}`}>
                  {e.type}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {e.date}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {e.time}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {e.location}
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
