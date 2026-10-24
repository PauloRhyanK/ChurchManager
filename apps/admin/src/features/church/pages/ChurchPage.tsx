import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Users,
  Sparkles,
  CalendarDays,
  Settings,
  Plus,
  Trash2,
  Pencil,
  MapPin,
  Loader2,
  Globe,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { DialogFooter } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/ImageUploader";
const CHURCH_IMAGE_UPLOAD_PATH = "/admin/tenants/me/church-config/upload-image";
import { getSiteIcon } from "@/features/site/components/site-icons";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import type { ChurchTab } from "@/features/site/components/site-flow-blocks";
import { SiteFlowTab } from "@/features/site/components/SiteFlowTab";
import { getApiErrorMessage } from "@/lib/api";
import { ConfigForm } from "../components/ConfigForm";
import { DiscardChangesDialog } from "../components/DiscardChangesDialog";
import { EditorDialog } from "../components/EditorDialog";
import { QueryState } from "../components/QueryState";
import { useEditorDialog } from "../hooks/use-editor-dialog";
import {
  fetchBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  fetchPastors,
  createPastor,
  updatePastor,
  deletePastor,
  fetchMinistries,
  createMinistry,
  updateMinistry,
  deleteMinistry,
  fetchSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  fetchChurchConfig,
  toBranchBody,
  toPastorBody,
  toMinistryBody,
  toScheduleBody,
  type BranchDto,
  type PastorDto,
  type MinistryDto,
  type ScheduleDto,
} from "../api/church-api";

// Ícones padrão permitidos no frontend
const PRESET_ICONS = [
  "Heart",
  "Users",
  "BookOpen",
  "MapPin",
  "Music",
  "Church",
  "Calendar",
  "Star",
  "Sparkles",
  "HandHeart",
  "Baby",
  "Flame",
  "Globe",
  "Phone",
  "Mail",
];

const SCHEDULE_DAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const CHURCH_TABS: ChurchTab[] = ["filiais", "pastores", "ministerios", "agenda", "ofertorio"];

export default function ChurchPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("CHURCH", "EDIT");
  const canViewChurch = can("CHURCH", "VIEW");
  const canViewSite = can("SITE", "VIEW");

  const allowedTabs: ChurchTab[] = [
    ...(canViewChurch ? CHURCH_TABS : []),
    ...(canViewSite ? (["site"] as const) : []),
  ];
  const isAllowedTab = (tab: string | null): tab is ChurchTab =>
    tab !== null && allowedTabs.includes(tab as ChurchTab);

  // A aba ativa é estado da página; a URL (?aba=) só a espelha, para links
  // diretos. Mudanças da URL vindas de fora passam pelo mesmo aviso de
  // alterações não salvas que o clique na aba (ver efeito abaixo).
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("aba");
  const [activeTabState, setActiveTab] = useState<ChurchTab>(() =>
    isAllowedTab(requestedTab) ? requestedTab : allowedTabs[0],
  );
  const activeTab = isAllowedTab(activeTabState) ? activeTabState : allowedTabs[0];
  const syncUrlTab = (tab: ChurchTab) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("aba", tab);
        return next;
      },
      { replace: true },
    );

  // Query / Mutations para Filiais
  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: fetchBranches,
    enabled: canViewChurch,
  });
  const branchEditor = useEditorDialog<Partial<BranchDto>>();

  const branchMutation = useMutation({
    mutationFn: (data: Partial<BranchDto>) =>
      data.id ? updateBranch(data.id, toBranchBody(data)) : createBranch(toBranchBody(data)),
    onSuccess: () => {
      toast.success(branchEditor.value?.id ? "Filial atualizada." : "Filial criada.");
      branchEditor.close();
      void queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteBranchMutation = useMutation({
    mutationFn: deleteBranch,
    onSuccess: () => {
      toast.success("Filial removida.");
      void queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  // Query / Mutations para Pastores
  const pastorsQuery = useQuery({
    queryKey: ["pastors"],
    queryFn: fetchPastors,
    enabled: canViewChurch,
  });
  const pastorEditor = useEditorDialog<Partial<PastorDto>>();

  const pastorMutation = useMutation({
    mutationFn: (data: Partial<PastorDto>) =>
      data.id ? updatePastor(data.id, toPastorBody(data)) : createPastor(toPastorBody(data)),
    onSuccess: () => {
      toast.success(pastorEditor.value?.id ? "Pastor atualizado." : "Pastor adicionado.");
      pastorEditor.close();
      void queryClient.invalidateQueries({ queryKey: ["pastors"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deletePastorMutation = useMutation({
    mutationFn: deletePastor,
    onSuccess: () => {
      toast.success("Pastor removido.");
      void queryClient.invalidateQueries({ queryKey: ["pastors"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  // Query / Mutations para Ministérios
  const ministriesQuery = useQuery({
    queryKey: ["ministries"],
    queryFn: fetchMinistries,
    enabled: canViewChurch,
  });
  const ministryEditor = useEditorDialog<Partial<MinistryDto>>();

  const ministryMutation = useMutation({
    mutationFn: (data: Partial<MinistryDto>) =>
      data.id ? updateMinistry(data.id, toMinistryBody(data)) : createMinistry(toMinistryBody(data)),
    onSuccess: () => {
      toast.success(ministryEditor.value?.id ? "Ministério atualizado." : "Ministério criado.");
      ministryEditor.close();
      void queryClient.invalidateQueries({ queryKey: ["ministries"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteMinistryMutation = useMutation({
    mutationFn: deleteMinistry,
    onSuccess: () => {
      toast.success("Ministério removido.");
      void queryClient.invalidateQueries({ queryKey: ["ministries"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  // Query / Mutations para Agenda Semanal
  const schedulesQuery = useQuery({
    queryKey: ["schedules"],
    queryFn: fetchSchedules,
    enabled: canViewChurch,
  });
  const scheduleEditor = useEditorDialog<Partial<ScheduleDto>>();

  const scheduleMutation = useMutation({
    mutationFn: (data: Partial<ScheduleDto>) =>
      data.id ? updateSchedule(data.id, toScheduleBody(data)) : createSchedule(toScheduleBody(data)),
    onSuccess: () => {
      toast.success(scheduleEditor.value?.id ? "Agenda atualizada." : "Agenda criada.");
      scheduleEditor.close();
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      toast.success("Horário de agenda removido.");
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  // Query / Mutations para Configurações do Tenant (Ofertório e Redes Sociais)
  const configQuery = useQuery({
    queryKey: ["church-config"],
    queryFn: fetchChurchConfig,
    enabled: canViewChurch,
  });

  // True enquanto o formulário de configuração tiver alterações não salvas.
  const [configDirty, setConfigDirty] = useState(false);
  // True enquanto a aba Site tiver ordem por salvar.
  const [siteDirty, setSiteDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<ChurchTab | null>(null);
  // O "Descartar" também fecha o diálogo; só o cancelamento devolve a URL à aba atual.
  const discardedRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    what: string;
    name: string;
    run: () => void;
  } | null>(null);

  const anyDirty =
    configDirty ||
    siteDirty ||
    branchEditor.dirty ||
    pastorEditor.dirty ||
    ministryEditor.dirty ||
    scheduleEditor.dirty;
  // A URL segue a aba ativa.
  useEffect(() => {
    if (searchParams.get("aba") !== activeTab) syncUrlTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // URL mudou por fora (link direto, barra lateral): trata como clique na aba;
  // sem aba válida, mantém a atual.
  useEffect(() => {
    if (requestedTab === activeTab || pendingTab !== null) return;
    if (isAllowedTab(requestedTab)) handleTabChange(requestedTab);
    else syncUrlTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab]);

  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const handleTabChange = (value: string) => {
    const next = value as ChurchTab;
    if (next === activeTab) return;
    const leavingDirty =
      (activeTab === "ofertorio" && configDirty) || (activeTab === "site" && siteDirty);
    if (leavingDirty) {
      setPendingTab(next);
      return;
    }
    setActiveTab(next);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Informações da Igreja</h1>
          <p className="text-muted-foreground">
            Configure dados institucionais, filiais, pastores, redes sociais, agenda e o site.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="flex flex-wrap w-full md:w-auto h-auto bg-muted p-1 gap-1">
            {canViewChurch && (
              <>
                <TabsTrigger value="filiais" className="gap-2 py-2">
                  <Building2 className="h-4 w-4" /> Filiais
                </TabsTrigger>
                <TabsTrigger value="pastores" className="gap-2 py-2">
                  <Users className="h-4 w-4" /> Pastores
                </TabsTrigger>
                <TabsTrigger value="ministerios" className="gap-2 py-2">
                  <Sparkles className="h-4 w-4" /> Ministérios
                </TabsTrigger>
                <TabsTrigger value="agenda" className="gap-2 py-2">
                  <CalendarDays className="h-4 w-4" /> Agenda Semanal
                </TabsTrigger>
                <TabsTrigger value="ofertorio" className="gap-2 py-2">
                  <Settings className="h-4 w-4" /> Ofertório & Redes
                </TabsTrigger>
              </>
            )}
            {canViewSite && (
              <TabsTrigger value="site" className="gap-2 py-2">
                <Globe className="h-4 w-4" /> Site
              </TabsTrigger>
            )}
          </TabsList>

          {/* TAB 1: FILIAIS */}
          <TabsContent value="filiais" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Filiais e Missões</CardTitle>
                  <CardDescription>
                    Nossas filiais espalhadas por diferentes regiões e a sede.
                  </CardDescription>
                </div>
                {canEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    branchEditor.openWith({
                      name: "",
                      location: "",
                      address: "",
                      image: "",
                      mapsUrl: "",
                      isHeadquarters: false,
                      active: true,
                      sortOrder: 0,
                    });
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar filial
                </Button>
                )}
              </CardHeader>
              <CardContent>
                <QueryState
                  query={branchesQuery}
                  loadingText="Carregando filiais..."
                  emptyText="Nenhuma filial cadastrada ainda."
                  isEmpty={(items) => items.length === 0}
                >
                  {(items) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>Endereço</TableHead>
                        <TableHead>Função</TableHead>
                        <TableHead>Visível</TableHead>
                        <TableHead className="w-[100px] text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((branch) => (
                        <TableRow key={branch.id}>
                          <TableCell className="font-semibold">{branch.name}</TableCell>
                          <TableCell>{branch.location || "—"}</TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">
                            {branch.address || "—"}
                          </TableCell>
                          <TableCell>
                            {branch.isHeadquarters ? (
                              <Badge variant="default" className="bg-primary hover:bg-primary">
                                Sede
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Filial</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={branch.active ? "outline" : "secondary"}>
                              {branch.active ? "Ativo" : "Oculto"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit && (
<div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  branchEditor.openWith(branch);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  setDeleteTarget({ what: "a filial", name: branch.name, run: () => deleteBranchMutation.mutate(branch.id) });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}
                </QueryState>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: TIME PASTORAL */}
          <TabsContent value="pastores" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Pastores e Líderes</CardTitle>
                  <CardDescription>
                    Gerencie o time pastoral e lideranças da igreja local.
                  </CardDescription>
                </div>
                {canEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    pastorEditor.openWith({
                      name: "",
                      image: "",
                      active: true,
                      sortOrder: 0,
                    });
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar pastor
                </Button>
                )}
              </CardHeader>
              <CardContent>
                <QueryState
                  query={pastorsQuery}
                  loadingText="Carregando pastores..."
                  emptyText="Nenhum pastor cadastrado ainda."
                  isEmpty={(items) => items.length === 0}
                >
                  {(items) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Foto</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Visível</TableHead>
                        <TableHead>Ordem</TableHead>
                        <TableHead className="w-[100px] text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((pastor) => (
                        <TableRow key={pastor.id}>
                          <TableCell>
                            {pastor.image ? (
                              <img
                                src={pastor.image}
                                alt={pastor.name}
                                className="h-10 w-10 object-cover rounded-full border bg-muted"
                              />
                            ) : (
                              <div className="h-10 w-10 bg-muted border rounded-full flex items-center justify-center text-xs font-bold">
                                {pastor.name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">{pastor.name}</TableCell>
                          <TableCell>
                            <Badge variant={pastor.active ? "outline" : "secondary"}>
                              {pastor.active ? "Ativo" : "Oculto"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {pastor.sortOrder}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit && (
<div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  pastorEditor.openWith(pastor);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  setDeleteTarget({ what: "o pastor", name: pastor.name, run: () => deletePastorMutation.mutate(pastor.id) });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}
                </QueryState>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: MINISTÉRIOS */}
          <TabsContent value="ministerios" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Ministérios e Departamentos</CardTitle>
                  <CardDescription>
                    Gerencie os grupos de trabalho, missões internas e departamentos.
                  </CardDescription>
                </div>
                {canEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    ministryEditor.openWith({
                      name: "",
                      description: "",
                      icon: "Heart",
                      image: "",
                      active: true,
                      sortOrder: 0,
                    });
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar ministério
                </Button>
                )}
              </CardHeader>
              <CardContent>
                <QueryState
                  query={ministriesQuery}
                  loadingText="Carregando ministérios..."
                  emptyText="Nenhum ministério cadastrado ainda."
                  isEmpty={(items) => items.length === 0}
                >
                  {(items) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Ícone</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Visível</TableHead>
                        <TableHead className="w-[100px] text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((ministry) => {
                        const Icon = getSiteIcon(ministry.icon || "Sparkles");
                        return (
                          <TableRow key={ministry.id}>
                            <TableCell>
                              <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/30">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">{ministry.name}</TableCell>
                            <TableCell className="max-w-xs truncate text-muted-foreground">
                              {ministry.description || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={ministry.active ? "outline" : "secondary"}>
                                {ministry.active ? "Ativo" : "Oculto"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {canEdit && (
<div className="flex justify-end gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    ministryEditor.openWith(ministry);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => {
                                    setDeleteTarget({ what: "o ministério", name: ministry.name, run: () => deleteMinistryMutation.mutate(ministry.id) });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  )}
                </QueryState>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: AGENDA SEMANAL */}
          <TabsContent value="agenda" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Agenda Semanal</CardTitle>
                  <CardDescription>
                    Horários de cultos, reuniões e eventos recorrentes. Aparecem no site e no telão (Site → Agenda do telão).
                  </CardDescription>
                </div>
                {canEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    scheduleEditor.openWith({
                      title: "",
                      dayOfWeek: "Domingo",
                      timeStart: "19:00",
                      location: "",
                      description: "",
                      active: true,
                      sortOrder: 0,
                    });
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar horário
                </Button>
                )}
              </CardHeader>
              <CardContent>
                <QueryState
                  query={schedulesQuery}
                  loadingText="Carregando agenda..."
                  emptyText="Nenhum horário cadastrado na programação semanal."
                  isEmpty={(items) => items.length === 0}
                >
                  {(items) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dia</TableHead>
                        <TableHead>Horário</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Visível</TableHead>
                        <TableHead className="w-[100px] text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((schedule) => {
                        const rawTime = schedule.timeStart || "";
                        // HH:MM:SS ou HH:MM
                        const formattedTime = rawTime.split(":").slice(0, 2).join("h");
                        return (
                          <TableRow key={schedule.id}>
                            <TableCell className="font-semibold">{schedule.dayOfWeek}</TableCell>
                            <TableCell className="font-mono">{formattedTime}</TableCell>
                            <TableCell>{schedule.title}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {schedule.location || "Sede"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={schedule.active ? "outline" : "secondary"}>
                                {schedule.active ? "Ativo" : "Oculto"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {canEdit && (
<div className="flex justify-end gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    // timeStart pode vir como HH:MM:SS ou ISO completa de DateTime
                                    let cleanTime = schedule.timeStart || "19:00";
                                    if (cleanTime.includes("T")) {
                                      cleanTime = cleanTime.split("T")[1].substring(0, 5);
                                    } else {
                                      cleanTime = cleanTime.substring(0, 5);
                                    }
                                    scheduleEditor.openWith({
                                      ...schedule,
                                      timeStart: cleanTime,
                                    });
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => {
                                    setDeleteTarget({ what: "o horário", name: schedule.title, run: () => deleteScheduleMutation.mutate(schedule.id) });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  )}
                </QueryState>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: OFERTÓRIO & CONFIGS */}
          <TabsContent value="ofertorio">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Ofertório, Redes Sociais e Contatos</CardTitle>
                <CardDescription>
                  Configure dados gerais da igreja, links sociais e dados bancários para PIX e transferências.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QueryState query={configQuery} loadingText="Carregando configurações...">
                  {(config) => (
                    <ConfigForm
                      config={config}
                      canEdit={canEdit}
                      onDirtyChange={setConfigDirty}
                    />
                  )}
                </QueryState>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: SITE */}
          <TabsContent value="site">
            <SiteFlowTab onDirtyChange={setSiteDirty} onGoToTab={handleTabChange} />
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL / DIALOG FILIAL */}
      <EditorDialog
        open={branchEditor.open}
        dirty={branchEditor.dirty}
        pending={branchMutation.isPending}
        onClose={branchEditor.close}
        className="max-w-lg"
        title={branchEditor.value?.id ? "Editar Filial" : "Criar Filial"}
        description="Preencha os dados de localização e imagem da filial."
      >
        {(requestClose) => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (branchEditor.value) {
                branchMutation.mutate(branchEditor.value);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="b-name">Nome da Filial *</Label>
              <Input
                id="b-name"
                maxLength={255}
                required
                value={branchEditor.value?.name ?? ""}
                onChange={(e) => branchEditor.setValue((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Igreja Paraíso — Centro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-location">Cidade / Estado</Label>
              <Input
                id="b-location"
                maxLength={255}
                value={branchEditor.value?.location ?? ""}
                onChange={(e) => branchEditor.setValue((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Santa Maria de Jetibá - ES"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-address">Endereço Completo</Label>
              <Textarea
                id="b-address"
                value={branchEditor.value?.address ?? ""}
                onChange={(e) => branchEditor.setValue((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Rua Helmut Gums, 438 - Centro"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-maps">Link do Google Maps</Label>
              <Input
                id="b-maps"
                maxLength={2048}
                type="url"
                value={branchEditor.value?.mapsUrl ?? ""}
                onChange={(e) => branchEditor.setValue((prev) => ({ ...prev, mapsUrl: e.target.value }))}
                placeholder="https://maps.app.goo.gl/..."
              />
            </div>
            <div className="space-y-2">
              <Label>Imagem da Fachada / Templo</Label>
              <ImageUploader
                value={branchEditor.value?.image ?? ""}
                onChange={(url) => branchEditor.setValue((prev) => ({ ...prev, image: url ?? "" }))}
                uploadPath={CHURCH_IMAGE_UPLOAD_PATH}
                prompt="Arraste ou clique para enviar foto"
                hint="Foto da fachada, de preferência horizontal. JPEG, PNG, WebP ou GIF, até 5 MB."
                successMessage="Imagem enviada."
              />
              <Input
                value={branchEditor.value?.image ?? ""}
                onChange={(e) => branchEditor.setValue((prev) => ({ ...prev, image: e.target.value }))}
                placeholder="URL da imagem"
                className="mt-1"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="b-hq"
                  checked={branchEditor.value?.isHeadquarters ?? false}
                  onCheckedChange={(checked) =>
                    branchEditor.setValue((prev) => ({ ...prev, isHeadquarters: checked }))
                  }
                />
                <Label htmlFor="b-hq">É a Sede Principal</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="b-active"
                  checked={branchEditor.value?.active ?? true}
                  onCheckedChange={(checked) =>
                    branchEditor.setValue((prev) => ({ ...prev, active: checked }))
                  }
                />
                <Label htmlFor="b-active">Visível no Site</Label>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={branchMutation.isPending}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={branchMutation.isPending}>
                {branchMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar filial
              </Button>
            </DialogFooter>
          </form>
        )}
      </EditorDialog>

      {/* MODAL / DIALOG PASTOR */}
      <EditorDialog
        open={pastorEditor.open}
        dirty={pastorEditor.dirty}
        pending={pastorMutation.isPending}
        onClose={pastorEditor.close}
        className="max-w-md"
        title={pastorEditor.value?.id ? "Editar Pastor" : "Adicionar Pastor"}
        description="Adicione as informações de nome e foto do pastor."
      >
        {(requestClose) => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pastorEditor.value) {
                pastorMutation.mutate(pastorEditor.value);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="p-name">Nome Completo *</Label>
              <Input
                id="p-name"
                maxLength={255}
                required
                value={pastorEditor.value?.name ?? ""}
                onChange={(e) => pastorEditor.setValue((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Pr. João da Silva"
              />
            </div>
            <div className="space-y-2">
              <Label>Foto do Pastor</Label>
              <ImageUploader
                value={pastorEditor.value?.image ?? ""}
                onChange={(url) => pastorEditor.setValue((prev) => ({ ...prev, image: url ?? "" }))}
                uploadPath={CHURCH_IMAGE_UPLOAD_PATH}
                prompt="Arraste ou clique para enviar foto"
                hint="Foto do pastor, de preferência de rosto. JPEG, PNG, WebP ou GIF, até 5 MB."
                successMessage="Foto enviada."
              />
              <Input
                value={pastorEditor.value?.image ?? ""}
                onChange={(e) => pastorEditor.setValue((prev) => ({ ...prev, image: e.target.value }))}
                placeholder="URL da imagem"
                className="mt-1"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="p-active"
                  checked={pastorEditor.value?.active ?? true}
                  onCheckedChange={(checked) =>
                    pastorEditor.setValue((prev) => ({ ...prev, active: checked }))
                  }
                />
                <Label htmlFor="p-active">Visível no Site</Label>
              </div>
              <div className="space-y-1 w-24">
                <Label htmlFor="p-order">Ordem</Label>
                <Input
                  id="p-order"
                  type="number"
                  min="0"
                  value={pastorEditor.value?.sortOrder ?? 0}
                  onChange={(e) =>
                    pastorEditor.setValue((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={pastorMutation.isPending}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pastorMutation.isPending}>
                {pastorMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar pastor
              </Button>
            </DialogFooter>
          </form>
        )}
      </EditorDialog>

      {/* MODAL / DIALOG MINISTÉRIO */}
      <EditorDialog
        open={ministryEditor.open}
        dirty={ministryEditor.dirty}
        pending={ministryMutation.isPending}
        onClose={ministryEditor.close}
        className="max-w-md"
        title={ministryEditor.value?.id ? "Editar Ministério" : "Adicionar Ministério"}
        description="Configure as informações básicas do ministério."
      >
        {(requestClose) => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ministryEditor.value) {
                ministryMutation.mutate(ministryEditor.value);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="m-name">Nome do Ministério *</Label>
              <Input
                id="m-name"
                maxLength={255}
                required
                value={ministryEditor.value?.name ?? ""}
                onChange={(e) => ministryEditor.setValue((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ministério Infantil / Jovens"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-desc">Descrição / Apresentação</Label>
              <Textarea
                id="m-desc"
                value={ministryEditor.value?.description ?? ""}
                onChange={(e) =>
                  ministryEditor.setValue((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Uma breve descrição sobre a atuação deste ministério..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-icon">Ícone Lucide</Label>
              <Select
                value={ministryEditor.value?.icon ?? "Sparkles"}
                onValueChange={(val) => ministryEditor.setValue((prev) => ({ ...prev, icon: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher ícone" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_ICONS.map((name) => {
                    const OptionIcon = getSiteIcon(name);
                    return (
                      <SelectItem key={name} value={name}>
                        <span className="flex items-center gap-2">
                          <OptionIcon className="h-4 w-4" />
                          {name}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Imagem de Capa (Opcional)</Label>
              <ImageUploader
                value={ministryEditor.value?.image ?? ""}
                onChange={(url) => ministryEditor.setValue((prev) => ({ ...prev, image: url ?? "" }))}
                uploadPath={CHURCH_IMAGE_UPLOAD_PATH}
                prompt="Arraste ou clique para enviar foto"
                hint="Imagem de capa do ministério. JPEG, PNG, WebP ou GIF, até 5 MB."
                successMessage="Imagem enviada."
              />
              <Input
                value={ministryEditor.value?.image ?? ""}
                onChange={(e) =>
                  ministryEditor.setValue((prev) => ({ ...prev, image: e.target.value }))
                }
                placeholder="URL da imagem"
                className="mt-1"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="m-active"
                  checked={ministryEditor.value?.active ?? true}
                  onCheckedChange={(checked) =>
                    ministryEditor.setValue((prev) => ({ ...prev, active: checked }))
                  }
                />
                <Label htmlFor="m-active">Visível no Site</Label>
              </div>
              <div className="space-y-1 w-24">
                <Label htmlFor="m-order">Ordem</Label>
                <Input
                  id="m-order"
                  type="number"
                  min="0"
                  value={ministryEditor.value?.sortOrder ?? 0}
                  onChange={(e) =>
                    ministryEditor.setValue((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={ministryMutation.isPending}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={ministryMutation.isPending}>
                {ministryMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar ministério
              </Button>
            </DialogFooter>
          </form>
        )}
      </EditorDialog>

      {/* MODAL / DIALOG AGENDA SEMANAL */}
      <EditorDialog
        open={scheduleEditor.open}
        dirty={scheduleEditor.dirty}
        pending={scheduleMutation.isPending}
        onClose={scheduleEditor.close}
        className="max-w-md"
        title={scheduleEditor.value?.id ? "Editar Programação" : "Nova Programação"}
        description="Defina o dia da semana, horário e local da programação recorrente."
      >
        {(requestClose) => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (scheduleEditor.value) {
                scheduleMutation.mutate(scheduleEditor.value);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="s-title">Título da Programação *</Label>
              <Input
                id="s-title"
                maxLength={255}
                required
                value={scheduleEditor.value?.title ?? ""}
                onChange={(e) => scheduleEditor.setValue((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Culto de Celebração / Doutrina"
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-day">Dia da Semana *</Label>
                <Select
                  value={scheduleEditor.value?.dayOfWeek ?? "Domingo"}
                  onValueChange={(val) =>
                    scheduleEditor.setValue((prev) => ({ ...prev, dayOfWeek: val }))
                  }
                >
                  <SelectTrigger id="s-day">
                    <SelectValue placeholder="Escolher dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_DAYS.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-time">Horário de Início (HH:MM) *</Label>
                <Input
                  id="s-time"
                  required
                  pattern="^([01]\d|2[0-3]):[0-5]\d$"
                  value={scheduleEditor.value?.timeStart ?? "19:00"}
                  onChange={(e) =>
                    scheduleEditor.setValue((prev) => ({ ...prev, timeStart: e.target.value }))
                  }
                  placeholder="19:00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-location">Local</Label>
              <Input
                id="s-location"
                maxLength={255}
                value={scheduleEditor.value?.location ?? ""}
                onChange={(e) => scheduleEditor.setValue((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Templo Sede (ou link do YouTube)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-desc">Observação / Descrição Curta</Label>
              <Input
                id="s-desc"
                maxLength={5000}
                value={scheduleEditor.value?.description ?? ""}
                onChange={(e) =>
                  scheduleEditor.setValue((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Ex: Transmissão online inclusa"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="s-active"
                  checked={scheduleEditor.value?.active ?? true}
                  onCheckedChange={(checked) =>
                    scheduleEditor.setValue((prev) => ({ ...prev, active: checked }))
                  }
                />
                <Label htmlFor="s-active">Visível no Site</Label>
              </div>
              <div className="space-y-1 w-24">
                <Label htmlFor="s-order">Ordem</Label>
                <Input
                  id="s-order"
                  type="number"
                  min="0"
                  value={scheduleEditor.value?.sortOrder ?? 0}
                  onChange={(e) =>
                    scheduleEditor.setValue((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={scheduleMutation.isPending}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={scheduleMutation.isPending}>
                {scheduleMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar programação
              </Button>
            </DialogFooter>
          </form>
        )}
      </EditorDialog>

      <DiscardChangesDialog
        open={pendingTab !== null}
        onOpenChange={(open) => {
          if (open) return;
          setPendingTab(null);
          if (!discardedRef.current) syncUrlTab(activeTab);
          discardedRef.current = false;
        }}
        onDiscard={() => {
          discardedRef.current = true;
          setConfigDirty(false);
          setSiteDirty(false);
          if (pendingTab) setActiveTab(pendingTab);
          setPendingTab(null);
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.what}?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" será removido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget?.run()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
