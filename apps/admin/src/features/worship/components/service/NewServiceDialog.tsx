import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchTemplates } from "../../api/worship-api";

const BUILT_IN = "padrao";

interface NewServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { date: string; startTime: string; templateId: string | null }) => void;
  creating: boolean;
  /** Data já escolhida (clique num dia do calendário), em AAAA-MM-DD. */
  initialDate?: string | null;
}

/** Próximo domingo (ou hoje, se for domingo), em AAAA-MM-DD no fuso do navegador. */
function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewServiceDialog({ open, onOpenChange, onCreate, creating, initialDate }: NewServiceDialogProps) {
  const templatesQuery = useQuery({ queryKey: ["worship", "templates"], queryFn: fetchTemplates, enabled: open });
  const templates = templatesQuery.data ?? [];
  const [date, setDate] = useState(nextSunday);
  const [template, setTemplate] = useState(BUILT_IN);
  const [startTime, setStartTime] = useState("19:00");

  useEffect(() => {
    if (open) {
      setDate(initialDate || nextSunday());
      setTemplate(BUILT_IN);
      setStartTime("19:00");
    }
  }, [open, initialDate]);

  const chosen = templates.find((t) => (t.id ?? BUILT_IN) === template);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo culto</DialogTitle>
          <DialogDescription>O roteiro nasce com os momentos do modelo. Depois dá para mudar tudo.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (date && startTime) onCreate({ date, startTime, templateId: chosen?.id ?? null });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="culto-modelo">Modelo</Label>
            <Select
              value={template}
              onValueChange={(value) => {
                setTemplate(value);
                const picked = templates.find((t) => (t.id ?? BUILT_IN) === value);
                if (picked) setStartTime(picked.startTime);
              }}
            >
              <SelectTrigger id="culto-modelo">
                <SelectValue placeholder="Culto padrão" />
              </SelectTrigger>
              <SelectContent>
                {(templates.length ? templates : [{ id: null, name: "Culto padrão" }]).map((t) => (
                  <SelectItem key={t.id ?? BUILT_IN} value={t.id ?? BUILT_IN}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosen && (
              <p className="text-[13px] text-muted-foreground">{chosen.moments.map((m) => m.name).join(" · ")}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="culto-data">Data</Label>
              <Input id="culto-data" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="culto-hora">Início</Label>
              <Input id="culto-hora" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!date || !startTime || creating}>
              Criar culto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
