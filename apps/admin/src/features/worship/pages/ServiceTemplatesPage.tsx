import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LayoutTemplate, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  updateTemplate,
  type ServiceTemplate,
  type TemplateBody,
} from "../api/worship-api";
import { TemplateEditorDialog } from "../components/service/TemplateEditorDialog";
import { formatMinutes, momentTimes } from "../lib/schedule";

const BLANK: ServiceTemplate = {
  id: null,
  name: "",
  startTime: "19:00",
  moments: [
    { name: "Abertura", kind: "GENERIC", durationMinutes: 5 },
    { name: "Louvor", kind: "WORSHIP", durationMinutes: 20 },
    { name: "Palavra", kind: "SERMON", durationMinutes: 40 },
  ],
};

const summary = (t: ServiceTemplate) => {
  const { totalMinutes } = momentTimes(t.startTime, t.moments);
  return `${t.moments.length} ${t.moments.length === 1 ? "momento" : "momentos"} · ${formatMinutes(totalMinutes)} · começa às ${t.startTime}`;
};

/** Cultos › Roteiro › Modelos de culto: criar, editar e excluir os pontos de partida de um culto. */
export default function ServiceTemplatesPage() {
  const { can } = usePermissions();
  const canEdit = can("WORSHIP", "EDIT");
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ["worship", "templates"], queryFn: fetchTemplates });
  const templates = templatesQuery.data ?? [];

  // `editing.id` nulo: modelo novo (em branco, ou partindo do padrão embutido).
  const [editing, setEditing] = useState<ServiceTemplate | null>(null);
  const [removing, setRemoving] = useState<ServiceTemplate | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["worship", "templates"] });
  const save = useMutation({
    mutationFn: (body: TemplateBody) => (editing?.id ? updateTemplate(editing.id, body) : createTemplate(body)),
    onSuccess: () => {
      toast.success(editing?.id ? "Modelo salvo." : "Modelo criado.");
      setEditing(null);
      void refresh();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      toast.success("Modelo excluído.");
      setRemoving(null);
      void refresh();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon" aria-label="Voltar para o Roteiro">
              <Link to="/cultos/roteiro">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Modelos de culto</h1>
          </div>
          {canEdit && (
            <Button className="gap-2" onClick={() => setEditing(BLANK)}>
              <Plus className="h-4 w-4" />
              Novo modelo
            </Button>
          )}
        </div>

        <p className="max-w-2xl text-sm text-muted-foreground">
          Um modelo é a lista de momentos de que um culto novo parte. Mudar ou excluir um modelo não altera os cultos já
          criados a partir dele.
        </p>

        {templatesQuery.error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {getApiErrorMessage(templatesQuery.error)}
          </p>
        )}

        {templatesQuery.isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando" />
          </div>
        ) : templates.length === 0 ? null : (
          <ul className="overflow-hidden rounded-xl border bg-card">
            {templates.map((template, i) => (
              <li key={template.id ?? "padrao"} className={`flex flex-wrap items-center gap-4 px-5 py-3.5 ${i === 0 ? "" : "border-t"}`}>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{template.name}</span>
                    {template.id === null && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Padrão do sistema
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{summary(template)}</span>
                  {template.id === null && (
                    <span className="text-[13px] text-muted-foreground">
                      Vale enquanto a igreja não tiver um modelo próprio. Ao criar o primeiro, ele sai desta lista.
                    </span>
                  )}
                </span>
                {canEdit &&
                  (template.id === null ? (
                    <Button variant="outline" className="gap-2" onClick={() => setEditing({ ...template })}>
                      <Pencil className="h-4 w-4" />
                      Personalizar
                    </Button>
                  ) : (
                    <span className="flex flex-none gap-1">
                      <Button variant="ghost" className="gap-2" onClick={() => setEditing(template)}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir o modelo ${template.name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setRemoving(template)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      <TemplateEditorDialog
        open={editing !== null}
        template={editing}
        creating={!editing?.id}
        saving={save.isPending}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(body) => save.mutate(body)}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o modelo “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele deixa de aparecer ao criar um culto. Os cultos já criados a partir dele continuam iguais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removing?.id) remove.mutate(removing.id);
              }}
            >
              Excluir modelo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
