import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  createEventTag,
  deleteEventTag,
  fetchEventTags,
} from "@/features/events/api/tenant-event-tags-api";
import {
  createEventFieldDefinition,
  deleteEventFieldDefinition,
  fetchEventFieldDefinitions,
  fieldTypeHasOptions,
  isTermsField,
  type EventFieldType,
  type EventFieldDefinitionDto,
} from "@/features/events/api/tenant-event-fields-api";
import type { EventTagDto } from "@/features/events/api/tenant-event-tags-api";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
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

const FIELD_TYPE_LABELS: Record<EventFieldType, string> = {
  TEXT: "Texto",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  CPF: "CPF",
  TEXTAREA: "Texto longo",
  SELECT: "Seleção",
  CHECKBOX: "Caixa de seleção",
  TERMS: "Termo de responsabilidade",
};

export default function EventSettingsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  // Criar e remover etiquetas e campos exige EDIT em eventos na API.
  const canEdit = can("EVENTS", "EDIT");
  const [tagName, setTagName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<EventFieldType>("TEXT");
  const [fieldOptionsText, setFieldOptionsText] = useState("");
  const [fieldTermText, setFieldTermText] = useState("");

  const [tagToDelete, setTagToDelete] = useState<EventTagDto | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<EventFieldDefinitionDto | null>(null);
  const [termToPreview, setTermToPreview] = useState<EventFieldDefinitionDto | null>(null);

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
    mutationFn: () => {
      const options = fieldTypeHasOptions(fieldType)
        ? fieldOptionsText.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;
      return createEventFieldDefinition({
        label: fieldLabel.trim(),
        type: fieldType,
        options,
        termText: isTermsField(fieldType) ? fieldTermText.trim() : undefined,
      });
    },
    onSuccess: () => {
      setFieldLabel("");
      setFieldType("TEXT");
      setFieldOptionsText("");
      setFieldTermText("");
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
              Use etiquetas para organizar os eventos. A primeira etiqueta aparece nos cartões do site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEdit && (
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
            )}

            {tagsQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : tagsQuery.error ? (
              <p className="text-sm text-destructive">{getApiErrorMessage(tagsQuery.error)}</p>
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
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              aria-label="Remover etiqueta"
                              disabled={deleteTagMutation.isPending}
                              onClick={() => {
                                setTagToDelete(tag);
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

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Campos de inscrição</CardTitle>
            <CardDescription>
              Campos padrão e personalizados disponíveis ao configurar ingressos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEdit && (
              <form
                className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (fieldLabel.trim()) createFieldMutation.mutate();
                }}
              >
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="field-label" className="text-xs">Rótulo</Label>
                    <Input
                      id="field-label"
                      value={fieldLabel}
                      onChange={(e) => setFieldLabel(e.target.value)}
                      placeholder={isTermsField(fieldType) ? "Ex.: Termo de imagem e voz" : "Rótulo (ex.: Empresa)"}
                      className="w-64"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={fieldType} onValueChange={(v) => setFieldType(v as EventFieldType)}>
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["TEXT", "EMAIL", "PHONE", "CPF", "TEXTAREA", "SELECT", "CHECKBOX", "TERMS"] as EventFieldType[]).map(
                          (t) => (
                            <SelectItem key={t} value={t}>
                              {FIELD_TYPE_LABELS[t]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {fieldTypeHasOptions(fieldType) && (
                    <div className="space-y-1 w-full sm:w-80 animate-in fade-in duration-200">
                      <Label htmlFor="field-options" className="text-xs">Opções do campo</Label>
                      <Input
                        id="field-options"
                        value={fieldOptionsText}
                        onChange={(e) => setFieldOptionsText(e.target.value)}
                        placeholder="Opções separadas por vírgula (ex.: P, M, G)"
                      />
                    </div>
                  )}
                  {!isTermsField(fieldType) && (
                    <Button
                      type="submit"
                      disabled={
                        !fieldLabel.trim() ||
                        (fieldTypeHasOptions(fieldType) && !fieldOptionsText.trim()) ||
                        createFieldMutation.isPending
                      }
                      className="gap-2"
                    >
                      {createFieldMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Adicionar
                    </Button>
                  )}
                </div>

                {isTermsField(fieldType) && (
                  <div className="space-y-2 pt-2 border-t animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="field-term-text" className="text-xs font-medium">
                        Texto completo do termo de responsabilidade
                      </Label>
                      <span className="text-[11px] text-muted-foreground">
                        {fieldTermText.length} caracteres
                      </span>
                    </div>
                    <Textarea
                      id="field-term-text"
                      value={fieldTermText}
                      onChange={(e) => setFieldTermText(e.target.value)}
                      placeholder="Cole ou escreva o texto do termo (ex.: Através dessa inscrição, autorizo de forma gratuita...)"
                      rows={4}
                      className="text-xs sm:text-sm font-sans"
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <p className="text-xs text-muted-foreground">
                        No ingresso ou no site, o participante lerá o termo em uma caixa de rolagem com checkbox de concordância.
                      </p>
                      <Button
                        type="submit"
                        disabled={
                          !fieldLabel.trim() ||
                          !fieldTermText.trim() ||
                          createFieldMutation.isPending
                        }
                        className="gap-2 shrink-0 self-end sm:self-auto"
                      >
                        {createFieldMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Adicionar termo
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            )}

            {fieldsQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : fieldsQuery.error ? (
              <p className="text-sm text-destructive">{getApiErrorMessage(fieldsQuery.error)}</p>
            ) : fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum campo de inscrição cadastrado.</p>
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
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {isTermsField(field.type) && <FileText className="h-4 w-4 text-primary shrink-0" />}
                          <span>{field.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>{FIELD_TYPE_LABELS[field.type]}</span>
                          {isTermsField(field.type) && field.termText && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-primary hover:text-primary gap-1"
                              onClick={() => setTermToPreview(field)}
                            >
                              <FileText className="h-3 w-3" />
                              Ver termo
                            </Button>
                          )}
                        </div>
                        {fieldTypeHasOptions(field.type) && field.options && field.options.length > 0 && (
                          <div className="text-xs text-muted-foreground/70 mt-0.5">
                            Opções: {field.options.join(", ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={field.isSystem ? "secondary" : "outline"}>
                          {field.isSystem ? "Padrão" : "Personalizado"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {canEdit && !field.isSystem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              aria-label="Remover campo"
                              disabled={deleteFieldMutation.isPending}
                              onClick={() => {
                                setFieldToDelete(field);
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

      {/* Modal para visualizar o texto completo do termo */}
      <Dialog open={Boolean(termToPreview)} onOpenChange={(open) => !open && setTermToPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              {termToPreview?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-60 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {termToPreview?.termText || "Nenhum texto cadastrado para este termo."}
            </div>
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <div className="h-4 w-4 rounded border border-primary/40 bg-background flex items-center justify-center text-primary text-[10px]">
                ✓
              </div>
              <span>No site público, o participante terá uma caixa de rolagem semelhante com checkbox de concordância.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTermToPreview(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog para excluir etiquetas */}
      <AlertDialog open={Boolean(tagToDelete)} onOpenChange={(open) => !open && setTagToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              {tagToDelete && tagToDelete.usageCount > 0 ? (
                <span>
                  A etiqueta <strong>«{tagToDelete.name}»</strong> está em uso em <strong>{tagToDelete.usageCount}</strong> evento(s).
                  Tem a certeza de que deseja removê-la? Esta ação não pode ser desfeita.
                </span>
              ) : (
                <span>
                  Tem a certeza de que deseja remover a etiqueta <strong>«{tagToDelete?.name}»</strong>? Esta ação não pode ser desfeita.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (tagToDelete) {
                  deleteTagMutation.mutate(tagToDelete.id);
                  setTagToDelete(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog para excluir campos personalizados */}
      <AlertDialog open={Boolean(fieldToDelete)} onOpenChange={(open) => !open && setFieldToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover campo personalizado?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza de que deseja remover o campo <strong>«{fieldToDelete?.label}»</strong>?
              Os dados recolhidos para este campo em inscrições anteriores podem não estar mais visíveis. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (fieldToDelete) {
                  deleteFieldMutation.mutate(fieldToDelete.id);
                  setFieldToDelete(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
