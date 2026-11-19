import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LayoutTemplate, Loader2, MoreHorizontal, Music, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import {
  createService,
  deleteService,
  fetchService,
  fetchServices,
  saveServiceAsTemplate,
  setServiceMoments,
  setServiceSongs,
  type ServicePlan,
} from "../api/worship-api";
import { AddSongDialog } from "../components/service/AddSongDialog";
import { MomentsTab } from "../components/service/MomentsTab";
import { NewServiceDialog } from "../components/service/NewServiceDialog";
import { WorshipTab } from "../components/service/WorshipTab";
import { formatServiceLabel } from "../lib/format";

type Tab = "culto" | "louvor";

export default function ServicePlanPage() {
  const { can } = usePermissions();
  const canEdit = can("WORSHIP", "EDIT");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("aba") === "louvor" ? "louvor" : "culto";

  const [newOpen, setNewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);

  const servicesQuery = useQuery({ queryKey: ["worship", "services"], queryFn: fetchServices });
  const services = servicesQuery.data ?? [];
  const today = new Date().toLocaleDateString("sv-SE");
  // Sem culto na URL: o próximo que ainda vai acontecer; se não houver, o mais recente.
  const fallback = [...services].reverse().find((s) => s.date >= today) ?? services[0];
  const serviceId = params.get("culto") ?? fallback?.id ?? null;

  const serviceQuery = useQuery({
    queryKey: ["worship", "service", serviceId],
    queryFn: () => fetchService(serviceId as string),
    enabled: !!serviceId,
  });
  const service = serviceQuery.data;

  const go = (next: { culto?: string | null; aba?: Tab }) => {
    const culto = next.culto === undefined ? serviceId : next.culto;
    const aba = next.aba ?? tab;
    const out: Record<string, string> = {};
    if (culto) out.culto = culto;
    if (aba === "louvor") out.aba = "louvor";
    setParams(out);
  };

  const adopt = (plan: ServicePlan) => {
    queryClient.setQueryData(["worship", "service", plan.id], plan);
    void queryClient.invalidateQueries({ queryKey: ["worship", "services"] });
  };
  const onError = (err: unknown) => toast.error(getApiErrorMessage(err));

  const create = useMutation({
    mutationFn: createService,
    onSuccess: (plan) => {
      adopt(plan);
      setNewOpen(false);
      go({ culto: plan.id, aba: "culto" });
      toast.success("Culto criado.");
    },
    onError,
  });
  const moments = useMutation({
    mutationFn: (list: Parameters<typeof setServiceMoments>[1]) => setServiceMoments(serviceId as string, list),
    onSuccess: adopt,
    onError,
  });
  const songs = useMutation({
    mutationFn: (ids: string[]) => setServiceSongs(serviceId as string, ids),
    onSuccess: adopt,
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteService(serviceId as string),
    onSuccess: () => {
      setDeleteOpen(false);
      queryClient.removeQueries({ queryKey: ["worship", "service", serviceId] });
      void queryClient.invalidateQueries({ queryKey: ["worship", "services"] });
      setParams({});
      toast.success("Culto apagado.");
    },
    onError,
  });
  const saveTemplate = useMutation({
    mutationFn: (name: string) => saveServiceAsTemplate(serviceId as string, name),
    onSuccess: () => {
      setTemplateName(null);
      void queryClient.invalidateQueries({ queryKey: ["worship", "templates"] });
      toast.success("Modelo salvo. Ele aparece ao criar o próximo culto.");
    },
    onError,
  });

  const loading = servicesQuery.isLoading || (!!serviceId && serviceQuery.isLoading);
  const error = servicesQuery.error ?? serviceQuery.error;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Roteiro</h1>
          {canEdit && (
            <Button className="gap-2" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo culto
            </Button>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {getApiErrorMessage(error)}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando" />
          </div>
        ) : !error && services.length === 0 ? (
          <div className="rounded-xl border bg-card px-6 py-14 text-center">
            <p className="font-semibold">Nenhum culto roteirizado ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie o culto a partir de um modelo e escolha as músicas do louvor.
            </p>
            {canEdit && (
              <Button className="mt-5 gap-2" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />
                Novo culto
              </Button>
            )}
          </div>
        ) : service ? (
          <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={service.id} onValueChange={(value) => go({ culto: value })}>
                <SelectTrigger aria-label="Culto" className="h-11 w-auto min-w-64 gap-2 font-semibold">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatServiceLabel(s.date, s.startTime)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
                Modelo: <b className="text-foreground">{service.name}</b>
              </span>
              <span className="flex-1" />
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Mais ações do culto">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setTemplateName(service.name)}>Salvar este culto como modelo</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => setDeleteOpen(true)}>
                      Apagar culto
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div role="tablist" aria-label="Visão do roteiro" className="flex gap-1 self-start rounded-xl bg-muted p-1">
              {(
                [
                  { key: "culto" as const, label: "Culto inteiro" },
                  { key: "louvor" as const, label: `Louvor · ${service.songs.length}` },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => go({ aba: t.key })}
                  className={
                    tab === t.key
                      ? "inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-4 text-sm font-semibold shadow-sm"
                      : "inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  {t.key === "louvor" && <Music className="h-4 w-4" aria-hidden="true" />}
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "culto" ? (
              <MomentsTab
                service={service}
                canEdit={canEdit}
                saving={moments.isPending}
                onSave={(list) => moments.mutate(list)}
                onOpenWorship={() => go({ aba: "louvor" })}
              />
            ) : (
              <WorshipTab
                service={service}
                canEdit={canEdit}
                saving={songs.isPending}
                onSave={(ids) => songs.mutate(ids)}
                onAdd={() => setAddOpen(true)}
              />
            )}
          </section>
        ) : null}
      </div>

      <NewServiceDialog open={newOpen} onOpenChange={setNewOpen} onCreate={(input) => create.mutate(input)} creating={create.isPending} />

      {service && (
        <AddSongDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdd={(songId) => songs.mutateAsync([...service.songs.map((s) => s.id), songId])}
          onOpenEditor={(songId) => navigate(`/cultos/musicas/${songId}`)}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este culto?</AlertDialogTitle>
            <AlertDialogDescription>
              O roteiro de {service ? formatServiceLabel(service.date, service.startTime) : "este culto"} é apagado. As
              músicas continuam no repertório.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Apagar culto</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={templateName !== null} onOpenChange={(open) => !open && setTemplateName(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar como modelo</DialogTitle>
            <DialogDescription>Guarda os momentos, as durações e o horário de início deste culto.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (templateName?.trim()) saveTemplate.mutate(templateName.trim());
            }}
          >
            <Input
              aria-label="Nome do modelo"
              value={templateName ?? ""}
              maxLength={120}
              placeholder="Domingo à noite"
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setTemplateName(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!templateName?.trim() || saveTemplate.isPending}>
                Salvar modelo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
