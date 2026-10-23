import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createEvent,
  fetchEvent,
  updateEvent,
  type EventDto,
} from "@/features/events/api/tenant-events-api";
import { EventTagsInput } from "@/features/events/components/EventTagsInput";
import { EventLocationInput } from "@/features/events/components/EventLocationInput";
import { ImageUploader } from "@/components/ImageUploader";
import {
  buildEventFormSchema,
  EVENT_FORM_DEFAULT_VALUES,
  eventFormToApiBody,
  type EventFormValues,
} from "@/features/events/schemas/event-form-schema";
import { todayDateInputMin } from "@/features/events/lib/event-form-validation";
import { getApiErrorMessage } from "@/lib/api";

export default function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Sempre pedido de novo ao abrir: o formulário é preenchido uma única vez e
  // não pode nascer de uma cache desactualizada.
  const eventQuery = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(id!),
    enabled: isEdit,
    refetchOnMount: "always",
  });

  // Na edição a data passada é aceite: corrigir ou despublicar um evento que já aconteceu.
  const schema = useMemo(() => buildEventFormSchema({ allowPastDate: isEdit }), [isEdit]);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EVENT_FORM_DEFAULT_VALUES,
  });

  const format = form.watch("format");

  // O formulário é preenchido uma única vez por evento, com o GET desta visita
  // concluído com sucesso (com erro, a cache pode estar desactualizada). Um
  // refetch (ex.: depois de trocar a capa) não pode apagar o que já foi digitado.
  const [initializedEventId, setInitializedEventId] = useState<string | null>(null);
  const isFormReady = !isEdit || initializedEventId === id;

  const isEventFresh = eventQuery.isFetchedAfterMount && !eventQuery.isError;

  useEffect(() => {
    const e = eventQuery.data;
    if (e && isEventFresh && initializedEventId !== e.id) {
      setInitializedEventId(e.id);
      form.reset({
        title: e.title,
        shortDescription: e.shortDescription ?? "",
        description: e.description ?? "",
        detailsHtml: e.detailsHtml ?? "",
        date: e.date,
        timeStart: e.timeStart?.slice(0, 5) ?? "",
        timeEnd: e.timeEnd?.slice(0, 5) ?? "",
        format: e.format ?? "IN_PERSON",
        location: e.location ?? "",
        onlineUrl: e.onlineUrl ?? "",
        coverImageUrl: e.coverImageUrl ?? "",
        videoUrl: e.videoUrl ?? "",
        tags: e.tags?.map((t) => t.name) ?? [],
        published: e.published,
      });
    }
  }, [eventQuery.data, isEventFresh, initializedEventId, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: EventFormValues) => {
      const body = eventFormToApiBody(values);
      if (isEdit) return updateEvent(id!, body);
      return createEvent(body);
    },
    onSuccess: (data) => {
      toast.success(isEdit ? "Evento actualizado." : "Evento criado.");
      queryClient.setQueryData(["event", data.id], data);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      navigate(isEdit ? `/eventos/${data.id}` : `/eventos/${data.id}`);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const coverMutation = useMutation({
    mutationFn: (coverUrl: string | null) => updateEvent(id!, { coverImageUrl: coverUrl }),
    onSuccess: (data) => {
      toast.success("Capa do evento actualizada.");
      form.setValue("coverImageUrl", data.coverImageUrl ?? "");
      // Actualiza só a capa em cache: refazer o GET do evento não é preciso.
      queryClient.setQueryData<EventDto>(["event", id], (old) =>
        old ? { ...old, coverImageUrl: data.coverImageUrl } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Editar evento" : "Novo evento"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Eventos publicados aparecem no site. Rascunhos ficam visíveis só no painel.
          </p>
        </div>

        {!isFormReady && !eventQuery.isError && (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar evento…
          </div>
        )}

        {eventQuery.error && (
          <p className="text-sm text-destructive">{getApiErrorMessage(eventQuery.error)}</p>
        )}

        {isFormReady && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Informações do evento</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
                noValidate
              >
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" {...form.register("title")} />
                  {form.formState.errors.title && (
                    <p className="text-sm text-red-600">{form.formState.errors.title.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shortDescription">Descrição curta</Label>
                  <Textarea
                    id="shortDescription"
                    rows={2}
                    placeholder="Resumo exibido nos cartões e no topo da página do evento"
                    {...form.register("shortDescription")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" rows={4} {...form.register("description")} />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="date">Data</Label>
                    <Input
                      id="date"
                      type="date"
                      min={isEdit ? undefined : todayDateInputMin()}
                      {...form.register("date")}
                    />
                    {form.formState.errors.date && (
                      <p className="text-sm text-red-600">{form.formState.errors.date.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeStart">Início</Label>
                    <Input id="timeStart" type="time" {...form.register("timeStart")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeEnd">Fim</Label>
                    <Input id="timeEnd" type="time" {...form.register("timeEnd")} />
                    {form.formState.errors.timeEnd && (
                      <p className="text-sm text-red-600">
                        {form.formState.errors.timeEnd.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Formato</Label>
                  <Controller
                    control={form.control}
                    name="format"
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-6"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="IN_PERSON" id="ef-in" />
                          <Label htmlFor="ef-in" className="font-normal">
                            Presencial
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="ONLINE" id="ef-on" />
                          <Label htmlFor="ef-on" className="font-normal">
                            Online
                          </Label>
                        </div>
                      </RadioGroup>
                    )}
                  />
                </div>

                {format === "ONLINE" ? (
                  <div className="space-y-2">
                    <Label htmlFor="onlineUrl">Link de transmissão</Label>
                    <Input id="onlineUrl" type="url" {...form.register("onlineUrl")} />
                    {form.formState.errors.onlineUrl && (
                      <p className="text-sm text-red-600">
                        {form.formState.errors.onlineUrl.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="location">Local</Label>
                    <Controller
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <EventLocationInput
                          id="location"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Imagem de capa (16:9)</Label>
                  <Controller
                    control={form.control}
                    name="coverImageUrl"
                    render={({ field }) => (
                      <ImageUploader
                        value={field.value}
                        hint="Imagem da capa do evento, proporção 16:9 (ex.: 1920x1080). JPEG, PNG, WebP ou GIF, até 5 MB."
                        disabled={coverMutation.isPending}
                        onChange={(url) => {
                          field.onChange(url);
                          if (isEdit) {
                            coverMutation.mutate(url?.trim() || null);
                          }
                        }}
                      />
                    )}
                  />
                  {form.formState.errors.coverImageUrl && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.coverImageUrl.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Etiquetas</Label>
                  <Controller
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <EventTagsInput
                        value={field.value ?? []}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">Publicado</p>
                    <p className="text-xs text-muted-foreground">
                      Eventos publicados aparecem no site público.
                    </p>
                  </div>
                  <Switch
                    checked={form.watch("published")}
                    onCheckedChange={(checked) => form.setValue("published", checked)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {isEdit ? "Guardar alterações" : "Criar evento"}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to={isEdit ? `/eventos/${id}` : "/eventos"}>Cancelar</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
