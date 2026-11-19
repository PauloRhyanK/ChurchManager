import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MomentKind, ServiceTemplate, TemplateBody } from "../../api/worship-api";
import { formatMinutes, momentTimes } from "../../lib/schedule";
import { MomentsEditor, type EditorMoment } from "./MomentsEditor";

interface LocalMoment {
  /** Chave só desta tela (para arrastar); o modelo guarda a lista sem ids. */
  key: string;
  name: string;
  kind: MomentKind;
  durationMinutes: number;
}

interface TemplateEditorDialogProps {
  open: boolean;
  /** Modelo a editar, ou o ponto de partida de um novo (id null). */
  template: ServiceTemplate | null;
  /** true: grava um modelo novo, mesmo que `template` tenha vindo preenchido (o padrão embutido). */
  creating: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: TemplateBody) => void;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const newKey = () => globalThis.crypto.randomUUID();

/** Criar ou editar um modelo de culto: nome, horário de início e a lista de momentos. */
export function TemplateEditorDialog({ open, template, creating, saving, onOpenChange, onSave }: TemplateEditorDialogProps) {
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [moments, setMoments] = useState<LocalMoment[]>([]);

  useEffect(() => {
    if (!open || !template) return;
    setName(template.name);
    setStartTime(template.startTime);
    setMoments(template.moments.map((m) => ({ key: newKey(), name: m.name, kind: m.kind, durationMinutes: m.durationMinutes })));
  }, [open, template]);

  const times = useMemo(() => momentTimes(TIME_RE.test(startTime) ? startTime : "00:00", moments), [startTime, moments]);
  const rows: EditorMoment[] = moments.map((m, i) => ({
    id: m.key,
    name: m.name,
    kind: m.kind,
    durationMinutes: m.durationMinutes,
    effectiveMinutes: m.durationMinutes,
    startsAt: times.startsAt[i],
  }));
  const valid = name.trim().length > 0 && TIME_RE.test(startTime) && moments.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{creating ? "Novo modelo de culto" : "Editar modelo de culto"}</DialogTitle>
          <DialogDescription>
            O modelo é o ponto de partida de um culto novo. Editar um modelo não muda os cultos já criados a partir dele.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave({
              name: name.trim(),
              startTime,
              moments: moments.map((m) => ({ name: m.name, kind: m.kind, durationMinutes: m.durationMinutes })),
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modelo-nome">Nome do modelo</Label>
              <Input id="modelo-nome" value={name} maxLength={120} placeholder="Domingo à noite" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modelo-hora">Início do culto</Label>
              <Input id="modelo-hora" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>

          <MomentsEditor
            moments={rows}
            canEdit
            showKind
            emptyText="O modelo precisa de pelo menos um momento."
            footer={`${moments.length} ${moments.length === 1 ? "momento" : "momentos"} · ${formatMinutes(times.totalMinutes)} · termina às ${times.endsAt}`}
            onSave={(next) =>
              setMoments(next.map((m) => ({ key: m.id ?? newKey(), name: m.name, kind: m.kind, durationMinutes: m.durationMinutes })))
            }
          />
          <p className="text-[13px] text-muted-foreground">
            Momentos "Antes do culto" no começo da lista contam para trás a partir do início. O momento do tipo Louvor
            recebe as músicas, e o do tipo Palavra recebe a palavra do pregador.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {creating ? "Criar modelo" : "Salvar modelo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
