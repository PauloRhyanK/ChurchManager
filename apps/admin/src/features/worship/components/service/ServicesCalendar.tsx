import { ChevronLeft, ChevronRight, Music, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServiceSummary } from "../../api/worship-api";
import { pad, shiftMonth, todayYmd } from "../../lib/calendar";

interface ServicesCalendarProps {
  /** Mês mostrado, em AAAA-MM. */
  month: string;
  services: ServiceSummary[];
  canEdit: boolean;
  onMonthChange: (month: string) => void;
  onOpen: (serviceId: string) => void;
  onCreate: (date: string) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

function hourLabel(startTime: string): string {
  const [hh, mm] = startTime.split(":");
  return mm === "00" ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
}

/** As semanas do mês (domingo a sábado); dias de fora do mês ficam como null. */
function weeksOf(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A entrada de Cultos: o mês com os cultos de cada dia. */
export function ServicesCalendar({ month, services, canEdit, onMonthChange, onOpen, onCreate }: ServicesCalendarProps) {
  const today = todayYmd();
  const byDay = new Map<string, ServiceSummary[]>();
  for (const s of services) {
    if (!s.date.startsWith(month)) continue;
    byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  const total = [...byDay.values()].reduce((n, list) => n + list.length, 0);

  return (
    <section aria-label="Calendário dos cultos" className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="min-w-44 text-center text-lg font-bold" aria-live="polite">
          {monthTitle(month)}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        {month !== today.slice(0, 7) && (
          <Button variant="outline" size="sm" onClick={() => onMonthChange(today.slice(0, 7))}>
            Hoje
          </Button>
        )}
        <span className="flex-1" />
        <span className="text-sm text-muted-foreground">
          {total === 0 ? "Nenhum culto neste mês" : total === 1 ? "1 culto" : `${total} cultos`}
        </span>
      </div>

      <div role="grid" aria-label={monthTitle(month)} className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        <div role="row" className="contents">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              role="columnheader"
              className="bg-muted px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        {weeksOf(month).map((week, wi) => (
          <div key={wi} role="row" className="contents">
            {week.map((day, di) => {
              if (!day) return <div key={di} role="gridcell" className="min-h-24 bg-muted/40" />;
              const list = byDay.get(day) ?? [];
              const isToday = day === today;
              const past = day < today;
              const dayNumber = Number(day.slice(8));
              const dayLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
                new Date(`${day}T12:00:00Z`),
              );
              return (
                <div
                  key={day}
                  role="gridcell"
                  className={`group relative flex min-h-24 flex-col gap-1 bg-card p-1 sm:p-1.5 ${past ? "bg-card/60" : ""}`}
                >
                  {canEdit && list.length === 0 ? (
                    // Dia vazio: o dia inteiro é o botão de criar.
                    <button
                      type="button"
                      aria-label={`Criar culto em ${dayLabel}`}
                      onClick={() => onCreate(day)}
                      className="absolute inset-0 rounded-sm outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus
                        aria-hidden="true"
                        className="absolute bottom-1.5 right-1.5 h-4 w-4 text-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      />
                    </button>
                  ) : null}
                  <span
                    className={`pointer-events-none relative self-start rounded-full px-1.5 text-[13px] leading-6 ${
                      isToday ? "bg-primary font-bold text-primary-foreground" : past ? "text-muted-foreground" : "font-semibold"
                    }`}
                  >
                    {dayNumber}
                  </span>
                  {list.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onOpen(s.id)}
                      title={`${s.name} · ${hourLabel(s.startTime)}`}
                      className={`relative flex min-h-8 w-full flex-col items-start rounded-md px-1.5 py-1 text-left text-[12px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        past
                          ? "bg-muted text-muted-foreground hover:bg-muted/70"
                          : "bg-primary/10 text-foreground hover:bg-primary/20"
                      }`}
                    >
                      <b className="font-semibold">{hourLabel(s.startTime)}</b>
                      <span className="hidden w-full truncate sm:block">{s.name}</span>
                      {s.songCount > 0 && (
                        <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                          <Music className="h-3 w-3" aria-hidden="true" />
                          {s.songCount}
                        </span>
                      )}
                    </button>
                  ))}
                  {canEdit && list.length > 0 && (
                    <button
                      type="button"
                      aria-label={`Criar outro culto em ${dayLabel}`}
                      onClick={() => onCreate(day)}
                      className="relative mt-auto flex h-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {canEdit && <p className="text-[13px] text-muted-foreground">Clique num dia vazio para criar o culto daquela data.</p>}
    </section>
  );
}
