import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ProjectionTopic } from "@/features/site/api/projection-api";
import { cn } from "@/lib/utils";
import { isTopicIncomplete, toTopicDraft, type TopicDraft } from "./projection-topics";

interface ProjectionTopicsEditorProps {
  topics: TopicDraft[];
  onChange: (topics: TopicDraft[]) => void;
  disabled?: boolean;
}

/** Avisos sem data (células, batismo…) da tela "participe" do telão. */
export function ProjectionTopicsEditor({ topics, onChange, disabled }: ProjectionTopicsEditorProps) {
  const update = (key: string, patch: Partial<ProjectionTopic>) =>
    onChange(topics.map((topic) => (topic.key === key ? { ...topic, ...patch } : topic)));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= topics.length) return;
    const next = [...topics];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const incomplete = topics.some(isTopicIncomplete);

  return (
    <section aria-labelledby="topicos-fixos" className="space-y-3 border-t pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="topicos-fixos" className="text-sm font-semibold">
            Tópicos fixos
          </h3>
          <p className="text-xs text-muted-foreground">
            Avisos sem data, como células. Aparecem na tela "participe", depois da agenda.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || topics.length >= 20}
          onClick={() =>
            onChange([
              ...topics,
              toTopicDraft({ title: "", text: "", callToAction: null, active: true }),
            ])
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          Adicionar tópico
        </Button>
      </div>

      {topics.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          Nenhum tópico fixo.
        </p>
      ) : (
        <ul className="space-y-2">
          {topics.map((topic, index) => {
            const name = topic.title.trim() || "tópico";
            const id = (field: string) => `topico-${topic.key}-${field}`;
            return (
              <li
                key={topic.key}
                className={cn("space-y-3 rounded-lg border p-3", !topic.active && "bg-muted/40")}
              >
                <div className="flex items-center gap-1">
                  <Switch
                    checked={topic.active}
                    disabled={disabled}
                    onCheckedChange={(active) => update(topic.key, { active })}
                    aria-label={`Mostrar ${name} no telão`}
                  />
                  <span className="ml-2 flex-1 truncate text-sm font-medium">
                    {topic.title.trim() || "Novo tópico"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Mover ${name} para cima`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={disabled || index === topics.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Mover ${name} para baixo`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => onChange(topics.filter((t) => t.key !== topic.key))}
                    aria-label={`Remover ${name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={id("titulo")} className="text-xs">
                      Título
                    </Label>
                    <Input
                      id={id("titulo")}
                      value={topic.title}
                      maxLength={40}
                      disabled={disabled}
                      placeholder="Células"
                      onChange={(e) => update(topic.key, { title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={id("chamada")} className="text-xs">
                      Chamada
                    </Label>
                    <Input
                      id={id("chamada")}
                      value={topic.callToAction ?? ""}
                      maxLength={80}
                      disabled={disabled}
                      placeholder="Procure a recepção"
                      onChange={(e) => update(topic.key, { callToAction: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={id("frase")} className="text-xs">
                      Frase
                    </Label>
                    <Input
                      id={id("frase")}
                      value={topic.text}
                      maxLength={55}
                      disabled={disabled}
                      placeholder="Encontre uma célula perto de você"
                      onChange={(e) => update(topic.key, { text: e.target.value })}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {incomplete && <p className="text-xs text-destructive">Preencha título e frase.</p>}
    </section>
  );
}
