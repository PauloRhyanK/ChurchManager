import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, LayoutTemplate, Loader2, MoreHorizontal, Music, Plus, Radio } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { PonteKeyDialog } from "../components/service/PonteKeyDialog";
import { ServicesCalendar } from "../components/service/ServicesCalendar";
import { parseMonth, todayYmd } from "../lib/calendar";
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
  const [newDate, setNewDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ponteOpen, setPonteOpen] = useState(false);
  // A chave dá acesso de leitura ao roteiro: gerar e revogar é de quem cuida das configurações.
  const canManagePonte = can("SETTINGS", "EDIT");
  const [templateName, setTemplateName] = useState<string | null>(null);

  const servicesQuery = useQuery({ queryKey: ["worship", "services"], queryFn: fetchServices });
  const services = servicesQuery.data ?? [];
  // Sem culto na URL: a entrada é o calendário do mês (o da URL ou o atual).
  const serviceId = params.get("culto");
  const month = parseMonth(params.get("mes")) ?? todayYmd().slice(0, 7);

  const serviceQuery = useQuery({
    queryKey: ["worship", "service", serviceId],
    queryFn: () => fetchService(serviceId as string),
    enabled: !!serviceId,
  });
  const service = serviceQuery.data;

  const openCalendar = (mes: string) => setParams(mes === todayYmd().slice(0, 7) ? {} : { mes });
  const openNew = (date: string | null) => {
    setNewDate(date);
    setNewOpen(true);
  };

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
      // Um culto novo pode casar com uma palavra guardada: a situação e os destinos das palavras mudam.
      void queryClient.invalidateQueries({ queryKey: ["sermons"] });
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
      void queryClient.invalidateQueries({ queryKey: ["sermons"] });
      openCalendar(service?.date.slice(0, 7) ?? month);
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
          <div className="flex items-center gap-2">
            {serviceId && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Voltar ao calendário"
                title="Voltar ao calendário"
                onClick={() => openCalendar(service?.date.slice(0, 7) ?? month)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{serviceId ? "Roteiro" : "Cultos"}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/cultos/roteiro/modelos">
                <LayoutTemplate className="h-4 w-4" />
                Modelos de culto
              </Link>
            </Button>
            {canManagePonte && (
              <Button variant="outline" className="gap-2" onClick={() => setPonteOpen(true)}>
                <Radio className="h-4 w-4" />
                Ponte do Culto
              </Button>
            )}
            {canEdit && (
              <Button className="gap-2" onClick={() => openNew(null)}>
                <Plus className="h-4 w-4" />
                Novo culto
              </Button>
            )}
          </div>
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
        ) : !serviceId ? (
          !error && (
            <ServicesCalendar
              month={month}
              services={services}
              canEdit={canEdit}
              onMonthChange={openCalendar}
              onOpen={(id) => go({ culto: id, aba: "culto" })}
              onCreate={(date) => openNew(date)}
            />
          )
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

      {canManagePonte && <PonteKeyDialog open={ponteOpen} onOpenChange={setPonteOpen} />}

      <NewServiceDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        initialDate={newDate}
        onCreate={(input) => create.mutate(input)}
        creating={create.isPending}
      />

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
