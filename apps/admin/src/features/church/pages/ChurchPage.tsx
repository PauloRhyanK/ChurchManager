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
  Heart,
  Globe,
  Phone,
  Mail,
  Loader2,
} from "lucide-react";
import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { getApiErrorMessage } from "@/lib/api";
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
  updateChurchConfig,
  type BranchDto,
  type PastorDto,
  type MinistryDto,
  type ScheduleDto,
  type ChurchConfigDto,
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

export default function ChurchPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("branches");

  // Query / Mutations para Filiais
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Partial<BranchDto> | null>(null);

  const branchMutation = useMutation({
    mutationFn: (data: Partial<BranchDto>) =>
      data.id ? updateBranch(data.id, data) : createBranch(data),
    onSuccess: () => {
      toast.success(editingBranch?.id ? "Filial atualizada." : "Filial criada.");
      setBranchModalOpen(false);
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
  const pastorsQuery = useQuery({ queryKey: ["pastors"], queryFn: fetchPastors });
  const [pastorModalOpen, setPastorModalOpen] = useState(false);
  const [editingPastor, setEditingPastor] = useState<Partial<PastorDto> | null>(null);

  const pastorMutation = useMutation({
    mutationFn: (data: Partial<PastorDto>) =>
      data.id ? updatePastor(data.id, data) : createPastor(data),
    onSuccess: () => {
      toast.success(editingPastor?.id ? "Pastor atualizado." : "Pastor adicionado.");
      setPastorModalOpen(false);
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
  const ministriesQuery = useQuery({ queryKey: ["ministries"], queryFn: fetchMinistries });
  const [ministryModalOpen, setMinistryModalOpen] = useState(false);
  const [editingMinistry, setEditingMinistry] = useState<Partial<MinistryDto> | null>(null);

  const ministryMutation = useMutation({
    mutationFn: (data: Partial<MinistryDto>) =>
      data.id ? updateMinistry(data.id, data) : createMinistry(data),
    onSuccess: () => {
      toast.success(editingMinistry?.id ? "Ministério atualizado." : "Ministério criado.");
      setMinistryModalOpen(false);
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
  const schedulesQuery = useQuery({ queryKey: ["schedules"], queryFn: fetchSchedules });
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Partial<ScheduleDto> | null>(null);

  const scheduleMutation = useMutation({
    mutationFn: (data: Partial<ScheduleDto>) =>
      data.id ? updateSchedule(data.id, data) : createSchedule(data),
    onSuccess: () => {
      toast.success(editingSchedule?.id ? "Agenda atualizada." : "Agenda criada.");
      setScheduleModalOpen(false);
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
  const configQuery = useQuery({ queryKey: ["church-config"], queryFn: fetchChurchConfig });

  const configMutation = useMutation({
    mutationFn: updateChurchConfig,
    onSuccess: () => {
      toast.success("Configurações atualizadas.");
      void queryClient.invalidateQueries({ queryKey: ["church-config"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Informações da Igreja</h1>
          <p className="text-muted-foreground">
            Configure dados institucionais, filiais, pastores, redes sociais e agenda.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap w-full md:w-auto h-auto bg-muted p-1 gap-1">
            <TabsTrigger value="branches" className="gap-2 py-2">
              <Building2 className="h-4 w-4" /> Filiais
            </TabsTrigger>
            <TabsTrigger value="pastors" className="gap-2 py-2">
              <Users className="h-4 w-4" /> Pastores
            </TabsTrigger>
            <TabsTrigger value="ministries" className="gap-2 py-2">
              <Sparkles className="h-4 w-4" /> Ministérios
            </TabsTrigger>
            <TabsTrigger value="schedules" className="gap-2 py-2">
              <CalendarDays className="h-4 w-4" /> Agenda Semanal
            </TabsTrigger>
            <TabsTrigger value="configs" className="gap-2 py-2">
              <Settings className="h-4 w-4" /> Ofertório & Redes
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: FILIAIS */}
          <TabsContent value="branches" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Filiais e Missões</CardTitle>
                  <CardDescription>
                    Nossas filiais espalhadas por diferentes regiões e a sede.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingBranch({
                      name: "",
                      location: "",
                      address: "",
                      image: "",
                      mapsUrl: "",
                      isHeadquarters: false,
                      active: true,
                      sortOrder: 0,
                    });
                    setBranchModalOpen(true);
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar filial
                </Button>
              </CardHeader>
              <CardContent>
                {branchesQuery.isLoading ? (
                  <div className="flex justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando filiais...
                  </div>
                ) : (branchesQuery.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    Nenhuma filial cadastrada ainda.
                  </div>
                ) : (
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
                      {(branchesQuery.data ?? []).map((branch) => (
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
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditingBranch(branch);
                                  setBranchModalOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  if (window.confirm(`Excluir a filial "${branch.name}"?`)) {
                                    deleteBranchMutation.mutate(branch.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: TIME PASTORAL */}
          <TabsContent value="pastors" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Pastores e Líderes</CardTitle>
                  <CardDescription>
                    Gerencie o time pastoral e lideranças da igreja local.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingPastor({
                      name: "",
                      image: "",
                      active: true,
                      sortOrder: 0,
                    });
                    setPastorModalOpen(true);
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar pastor
                </Button>
              </CardHeader>
              <CardContent>
                {pastorsQuery.isLoading ? (
                  <div className="flex justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando pastores...
                  </div>
                ) : (pastorsQuery.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    Nenhum pastor cadastrado ainda.
                  </div>
                ) : (
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
                      {(pastorsQuery.data ?? []).map((pastor) => (
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
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditingPastor(pastor);
                                  setPastorModalOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  if (window.confirm(`Excluir o pastor "${pastor.name}"?`)) {
                                    deletePastorMutation.mutate(pastor.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: MINISTÉRIOS */}
          <TabsContent value="ministries" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Ministérios e Departamentos</CardTitle>
                  <CardDescription>
                    Gerencie os grupos de trabalho, missões internas e departamentos.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingMinistry({
                      name: "",
                      description: "",
                      icon: "Heart",
                      image: "",
                      active: true,
                      sortOrder: 0,
                    });
                    setMinistryModalOpen(true);
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar ministério
                </Button>
              </CardHeader>
              <CardContent>
                {ministriesQuery.isLoading ? (
                  <div className="flex justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando ministérios...
                  </div>
                ) : (ministriesQuery.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    Nenhum ministério cadastrado ainda.
                  </div>
                ) : (
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
                      {(ministriesQuery.data ?? []).map((ministry) => {
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
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setEditingMinistry(ministry);
                                    setMinistryModalOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => {
                                    if (window.confirm(`Excluir o ministério "${ministry.name}"?`)) {
                                      deleteMinistryMutation.mutate(ministry.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: AGENDA SEMANAL */}
          <TabsContent value="schedules" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Agenda Semanal</CardTitle>
                  <CardDescription>
                    Horários de cultos, reuniões e eventos recorrentes que aparecem na programação.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingSchedule({
                      title: "",
                      dayOfWeek: "Domingo",
                      timeStart: "19:00",
                      location: "",
                      description: "",
                      active: true,
                      sortOrder: 0,
                    });
                    setScheduleModalOpen(true);
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Adicionar horário
                </Button>
              </CardHeader>
              <CardContent>
                {schedulesQuery.isLoading ? (
                  <div className="flex justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando agenda...
                  </div>
                ) : (schedulesQuery.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    Nenhum horário cadastrado na programação semanal.
                  </div>
                ) : (
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
                      {(schedulesQuery.data ?? []).map((schedule) => {
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
                                    setEditingSchedule({
                                      ...schedule,
                                      timeStart: cleanTime,
                                    });
                                    setScheduleModalOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => {
                                    if (window.confirm(`Excluir o horário "${schedule.title}"?`)) {
                                      deleteScheduleMutation.mutate(schedule.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: OFERTÓRIO & CONFIGS */}
          <TabsContent value="configs">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Ofertório, Redes Sociais e Contatos</CardTitle>
                <CardDescription>
                  Configure dados gerais da igreja, links sociais e dados bancários para PIX e transferências.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {configQuery.isLoading ? (
                  <div className="flex justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando configurações...
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const payload: Partial<ChurchConfigDto> = {
                        phone: formData.get("phone") as string || null,
                        email: formData.get("email") as string || null,
                        address: formData.get("address") as string || null,
                        pixKey: formData.get("pixKey") as string || null,
                        bankName: formData.get("bankName") as string || null,
                        bankCode: formData.get("bankCode") as string || null,
                        agency: formData.get("agency") as string || null,
                        account: formData.get("account") as string || null,
                        holderName: formData.get("holderName") as string || null,
                        holderDocument: formData.get("holderDocument") as string || null,
                        youtubeUrl: formData.get("youtubeUrl") as string || null,
                        instagramUrl: formData.get("instagramUrl") as string || null,
                        facebookUrl: formData.get("facebookUrl") as string || null,
                      };
                      configMutation.mutate(payload);
                    }}
                    className="space-y-6"
                  >
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* Seção: Contato */}
                      <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                          <Phone className="h-4 w-4" /> Informações de Contato
                        </h3>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Telefone</Label>
                          <Input
                            id="phone"
                            name="phone"
                            defaultValue={configQuery.data?.phone ?? ""}
                            placeholder="(27) 99875-7008"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">E-mail</Label>
                          <Input
                            id="email"
                            name="email"
                            defaultValue={configQuery.data?.email ?? ""}
                            placeholder="contato@igreja.com.br"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="address">Endereço Sede</Label>
                          <Textarea
                            id="address"
                            name="address"
                            defaultValue={configQuery.data?.address ?? ""}
                            placeholder="Rua Helmut Gums, 438 - Virada, Santa Maria de Jetibá - ES"
                            rows={3}
                          />
                        </div>
                      </div>

                      {/* Seção: Redes Sociais */}
                      <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                          <Globe className="h-4 w-4" /> Redes Sociais
                        </h3>
                        <div className="space-y-2">
                          <Label htmlFor="youtubeUrl">Canal do YouTube (URL)</Label>
                          <Input
                            id="youtubeUrl"
                            name="youtubeUrl"
                            type="url"
                            defaultValue={configQuery.data?.youtubeUrl ?? ""}
                            placeholder="https://www.youtube.com/@paraisoigreja"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="instagramUrl">Perfil do Instagram (URL)</Label>
                          <Input
                            id="instagramUrl"
                            name="instagramUrl"
                            type="url"
                            defaultValue={configQuery.data?.instagramUrl ?? ""}
                            placeholder="https://www.instagram.com/paraisoigreja/"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="facebookUrl">Página do Facebook (URL)</Label>
                          <Input
                            id="facebookUrl"
                            name="facebookUrl"
                            type="url"
                            defaultValue={configQuery.data?.facebookUrl ?? ""}
                            placeholder="https://www.facebook.com/paraisoigreja/"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Seção: Dados Bancários / Ofertório */}
                    <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Heart className="h-4 w-4" /> Dados de Dízimos & Ofertas
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="pixKey">Chave PIX</Label>
                          <Input
                            id="pixKey"
                            name="pixKey"
                            defaultValue={configQuery.data?.pixKey ?? ""}
                            placeholder="projeto@visaodofuturo.com.br"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bankName">Nome do Banco</Label>
                          <Input
                            id="bankName"
                            name="bankName"
                            defaultValue={configQuery.data?.bankName ?? ""}
                            placeholder="Sicoob"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bankCode">Cód. Banco</Label>
                          <Input
                            id="bankCode"
                            name="bankCode"
                            defaultValue={configQuery.data?.bankCode ?? ""}
                            placeholder="756"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="agency">Agência</Label>
                          <Input
                            id="agency"
                            name="agency"
                            defaultValue={configQuery.data?.agency ?? ""}
                            placeholder="3007"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="account">Conta Corrente</Label>
                          <Input
                            id="account"
                            name="account"
                            defaultValue={configQuery.data?.account ?? ""}
                            placeholder="12345-6"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="holderName">Nome do Favorecido (Razão Social)</Label>
                          <Input
                            id="holderName"
                            name="holderName"
                            defaultValue={configQuery.data?.holderName ?? ""}
                            placeholder="Igreja Paraíso"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="holderDocument">CNPJ do Favorecido</Label>
                          <Input
                            id="holderDocument"
                            name="holderDocument"
                            defaultValue={configQuery.data?.holderDocument ?? ""}
                            placeholder="00.000.000/0001-00"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={configMutation.isPending}>
                        {configMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Salvar Alterações
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL / DIALOG FILIAL */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBranch?.id ? "Editar Filial" : "Criar Filial"}</DialogTitle>
            <DialogDescription>Preencha os dados de localização e imagem da filial.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingBranch) {
                branchMutation.mutate(editingBranch);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="b-name">Nome da Filial *</Label>
              <Input
                id="b-name"
                required
                value={editingBranch?.name ?? ""}
                onChange={(e) => setEditingBranch((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Igreja Paraíso — Centro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-location">Cidade / Estado</Label>
              <Input
                id="b-location"
                value={editingBranch?.location ?? ""}
                onChange={(e) => setEditingBranch((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Santa Maria de Jetibá - ES"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-address">Endereço Completo</Label>
              <Textarea
                id="b-address"
                value={editingBranch?.address ?? ""}
                onChange={(e) => setEditingBranch((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Rua Helmut Gums, 438 - Centro"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-maps">Link do Google Maps</Label>
              <Input
                id="b-maps"
                type="url"
                value={editingBranch?.mapsUrl ?? ""}
                onChange={(e) => setEditingBranch((prev) => ({ ...prev, mapsUrl: e.target.value }))}
                placeholder="https://maps.app.goo.gl/..."
              />
            </div>
            <div className="space-y-2">
              <Label>Imagem da Fachada / Templo</Label>
              <ImageUploader
                value={editingBranch?.image ?? ""}
                onChange={(url) => setEditingBranch((prev) => ({ ...prev, image: url ?? "" }))}
                uploadPath={CHURCH_IMAGE_UPLOAD_PATH}
                prompt="Arraste ou clique para enviar foto"
                hint="Use imagens horizontais para melhor visualização."
                successMessage="Imagem enviada."
              />
              <Input
                value={editingBranch?.image ?? ""}
                onChange={(e) => setEditingBranch((prev) => ({ ...prev, image: e.target.value }))}
                placeholder="URL da imagem"
                className="mt-1"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="b-hq"
                  checked={editingBranch?.isHeadquarters ?? false}
                  onCheckedChange={(checked) =>
                    setEditingBranch((prev) => ({ ...prev, isHeadquarters: checked }))
                  }
                />
                <Label htmlFor="b-hq">É a Sede Principal</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="b-active"
                  checked={editingBranch?.active ?? true}
                  onCheckedChange={(checked) =>
                    setEditingBranch((prev) => ({ ...prev, active: checked }))
                  }
                />
                <Label htmlFor="b-active">Visível no Site</Label>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setBranchModalOpen(false)}>
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
        </DialogContent>
      </Dialog>

      {/* MODAL / DIALOG PASTOR */}
      <Dialog open={pastorModalOpen} onOpenChange={setPastorModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPastor?.id ? "Editar Pastor" : "Adicionar Pastor"}</DialogTitle>
            <DialogDescription>Adicione as informações de nome e foto do pastor.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingPastor) {
                pastorMutation.mutate(editingPastor);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="p-name">Nome Completo *</Label>
              <Input
                id="p-name"
                required
                value={editingPastor?.name ?? ""}
                onChange={(e) => setEditingPastor((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Pr. João da Silva"
              />
            </div>
            <div className="space-y-2">
              <Label>Foto do Pastor</Label>
              <ImageUploader
                value={editingPastor?.image ?? ""}
                onChange={(url) => setEditingPastor((prev) => ({ ...prev, image: url ?? "" }))}
                uploadPath={CHURCH_IMAGE_UPLOAD_PATH}
                prompt="Arraste ou clique para enviar foto"
                successMessage="Foto enviada."
              />
              <Input
                value={editingPastor?.image ?? ""}
                onChange={(e) => setEditingPastor((prev) => ({ ...prev, image: e.target.value }))}
                placeholder="URL da imagem"
                className="mt-1"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="p-active"
                  checked={editingPastor?.active ?? true}
                  onCheckedChange={(checked) =>
                    setEditingPastor((prev) => ({ ...prev, active: checked }))
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
                  value={editingPastor?.sortOrder ?? 0}
                  onChange={(e) =>
                    setEditingPastor((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setPastorModalOpen(false)}>
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
        </DialogContent>
      </Dialog>

      {/* MODAL / DIALOG MINISTÉRIO */}
      <Dialog open={ministryModalOpen} onOpenChange={setMinistryModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingMinistry?.id ? "Editar Ministério" : "Adicionar Ministério"}
            </DialogTitle>
            <DialogDescription>Configure as informações básicas do ministério.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingMinistry) {
                ministryMutation.mutate(editingMinistry);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="m-name">Nome do Ministério *</Label>
              <Input
                id="m-name"
                required
                value={editingMinistry?.name ?? ""}
                onChange={(e) => setEditingMinistry((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ministério Infantil / Jovens"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-desc">Descrição / Apresentação</Label>
              <Textarea
                id="m-desc"
                value={editingMinistry?.description ?? ""}
                onChange={(e) =>
                  setEditingMinistry((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Uma breve descrição sobre a atuação deste ministério..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-icon">Ícone Lucide</Label>
              <Select
                value={editingMinistry?.icon ?? "Sparkles"}
                onValueChange={(val) => setEditingMinistry((prev) => ({ ...prev, icon: val }))}
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
                value={editingMinistry?.image ?? ""}
                onChange={(url) => setEditingMinistry((prev) => ({ ...prev, image: url ?? "" }))}
                uploadPath={CHURCH_IMAGE_UPLOAD_PATH}
                prompt="Arraste ou clique para enviar foto"
                successMessage="Imagem enviada."
              />
              <Input
                value={editingMinistry?.image ?? ""}
                onChange={(e) =>
                  setEditingMinistry((prev) => ({ ...prev, image: e.target.value }))
                }
                placeholder="URL da imagem"
                className="mt-1"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="m-active"
                  checked={editingMinistry?.active ?? true}
                  onCheckedChange={(checked) =>
                    setEditingMinistry((prev) => ({ ...prev, active: checked }))
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
                  value={editingMinistry?.sortOrder ?? 0}
                  onChange={(e) =>
                    setEditingMinistry((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setMinistryModalOpen(false)}>
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
        </DialogContent>
      </Dialog>

      {/* MODAL / DIALOG AGENDA SEMANAL */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule?.id ? "Editar Programação" : "Nova Programação"}
            </DialogTitle>
            <DialogDescription>
              Defina o dia da semana, horário e local da programação recorrente.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingSchedule) {
                scheduleMutation.mutate(editingSchedule);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="s-title">Título da Programação *</Label>
              <Input
                id="s-title"
                required
                value={editingSchedule?.title ?? ""}
                onChange={(e) => setEditingSchedule((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Culto de Celebração / Doutrina"
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-day">Dia da Semana *</Label>
                <Select
                  value={editingSchedule?.dayOfWeek ?? "Domingo"}
                  onValueChange={(val) =>
                    setEditingSchedule((prev) => ({ ...prev, dayOfWeek: val }))
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
                  value={editingSchedule?.timeStart ?? "19:00"}
                  onChange={(e) =>
                    setEditingSchedule((prev) => ({ ...prev, timeStart: e.target.value }))
                  }
                  placeholder="19:00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-location">Local</Label>
              <Input
                id="s-location"
                value={editingSchedule?.location ?? ""}
                onChange={(e) => setEditingSchedule((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Templo Sede (ou link do YouTube)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-desc">Observação / Descrição Curta</Label>
              <Input
                id="s-desc"
                value={editingSchedule?.description ?? ""}
                onChange={(e) =>
                  setEditingSchedule((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Ex: Transmissão online inclusa"
              />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="s-active"
                  checked={editingSchedule?.active ?? true}
                  onCheckedChange={(checked) =>
                    setEditingSchedule((prev) => ({ ...prev, active: checked }))
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
                  value={editingSchedule?.sortOrder ?? 0}
                  onChange={(e) =>
                    setEditingSchedule((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setScheduleModalOpen(false)}>
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
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
