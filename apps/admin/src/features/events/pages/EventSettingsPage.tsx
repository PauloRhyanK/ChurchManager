import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createEventTag,
  deleteEventTag,
  fetchEventTags,
} from "@/features/events/api/tenant-event-tags-api";
import {
  createEventFieldDefinition,
  deleteEventFieldDefinition,
  fetchEventFieldDefinitions,
  type EventFieldType,
} from "@/features/events/api/tenant-event-fields-api";
import { getApiErrorMessage } from "@/lib/api";

const FIELD_TYPE_LABELS: Record<EventFieldType, string> = {
  TEXT: "Texto",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  CPF: "CPF",
  TEXTAREA: "Texto longo",
  SELECT: "Seleção",
  CHECKBOX: "Caixa de seleção",
};

export default function EventSettingsPage() {
  const queryClient = useQueryClient();
  const [tagName, setTagName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<EventFieldType>("TEXT");

  const tagsQuery = useQuery({ queryKey: ["event-tags"], queryFn: fetchEventTags });
  const fieldsQuery = useQuery({
    queryKey: ["event-field-definitions"],
    queryFn: fetchEventFieldDefinitions,
  });

  const createTagMutation = useMutation({
    mutationFn: () => createEventTag(tagName.trim()),
    onSuccess: () => {
      setTagName("");
      void queryClient.invalidateQueries({ queryKey: ["event-tags"] });
      toast.success("Etiqueta criada.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: string) => deleteEventTag(tagId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["event-tags"] });
      toast.success("Etiqueta removida.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const createFieldMutation = useMutation({
    mutationFn: () =>
      createEventFieldDefinition({ label: fieldLabel.trim(), type: fieldType }),
    onSuccess: () => {
      setFieldLabel("");
      setFieldType("TEXT");
      void queryClient.invalidateQueries({ queryKey: ["event-field-definitions"] });
      toast.success("Campo criado.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) => deleteEventFieldDefinition(fieldId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["event-field-definitions"] });
      toast.success("Campo removido.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const tags = tagsQuery.data ?? [];
  const fields = fieldsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                Configurações de eventos
              </h1>
            </div>
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
              Etiquetas reutilizáveis e campos de inscrição partilhados entre
              eventos.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/eventos">Voltar a eventos</Link>
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Etiquetas</CardTitle>
            <CardDescription>
              Use etiquetas para agrupar e filtrar eventos no site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (tagName.trim()) createTagMutation.mutate();
              }}
            >
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Nova etiqueta (ex.: retiro)"
                className="max-w-xs"
              />
              <Button type="submit" disabled={!tagName.trim() || createTagMutation.isPending} className="gap-2">
                {createTagMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Adicionar
              </Button>
            </form>

            {tagsQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma etiqueta criada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Em uso</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tags.map((tag) => (
                    <TableRow key={tag.id}>
                      <TableCell className="font-medium">{tag.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {tag.usageCount} evento(s)
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            disabled={deleteTagMutation.isPending}
                            onClick={() => {
                              const warn =
                                tag.usageCount > 0
                                  ? `«${tag.name}» está em ${tag.usageCount} evento(s). Remover mesmo assim?`
                                  : `Remover «${tag.name}»?`;
                              if (window.confirm(warn)) deleteTagMutation.mutate(tag.id);
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

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Campos de inscrição</CardTitle>
            <CardDescription>
              Campos padrão e personalizados disponíveis ao configurar ingressos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (fieldLabel.trim()) createFieldMutation.mutate();
              }}
            >
              <Input
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
                placeholder="Rótulo (ex.: Empresa)"
                className="max-w-xs"
              />
              <Select value={fieldType} onValueChange={(v) => setFieldType(v as EventFieldType)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["TEXT", "EMAIL", "PHONE", "CPF", "TEXTAREA", "CHECKBOX"] as EventFieldType[]).map(
                    (t) => (
                      <SelectItem key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Button
                type="submit"
                disabled={!fieldLabel.trim() || createFieldMutation.isPending}
                className="gap-2"
              >
                {createFieldMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Adicionar
              </Button>
            </form>

            {fieldsQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rótulo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field) => (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{field.label}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {FIELD_TYPE_LABELS[field.type]}
                      </TableCell>
                      <TableCell>
                        <Badge variant={field.isSystem ? "secondary" : "outline"}>
                          {field.isSystem ? "Padrão" : "Personalizado"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {!field.isSystem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              disabled={deleteFieldMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Remover «${field.label}»?`)) {
                                  deleteFieldMutation.mutate(field.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
