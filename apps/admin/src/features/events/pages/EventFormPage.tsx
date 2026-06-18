import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
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
} from "@/features/events/api/tenant-events-api";
import { EventTagsInput } from "@/features/events/components/EventTagsInput";
import { ImageUploader } from "@/components/ImageUploader";
import {
  eventFormSchema,
  eventFormToApiBody,
  type EventFormValues,
} from "@/features/events/schemas/event-form-schema";
import { getApiErrorMessage } from "@/lib/api";

export default function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const eventQuery = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(id!),
    enabled: isEdit,
  });

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      shortDescription: "",
      description: "",
      detailsHtml: "",
      date: "",
      timeStart: "",
      timeEnd: "",
      format: "IN_PERSON",
      location: "",
      onlineUrl: "",
      coverImageUrl: "",
      videoUrl: "",
      tags: [],
      published: true,
    },
  });

  const format = form.watch("format");

  useEffect(() => {
    if (eventQuery.data) {
      const e = eventQuery.data;
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
  }, [eventQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: EventFormValues) => {
      const body = eventFormToApiBody(values);
      if (isEdit) return updateEvent(id!, body);
      return createEvent(body);
    },
    onSuccess: (data) => {
      toast.success(isEdit ? "Evento actualizado." : "Evento criado.");
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
      navigate(isEdit ? `/eventos/${data.id}` : `/eventos/${data.id}`);
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
            Campos alinhados à API admin — datas em YYYY-MM-DD, horários em HH:MM.
          </p>
        </div>

        {eventQuery.isLoading && isEdit && (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar evento…
          </div>
        )}

        {eventQuery.error && (
          <p className="text-sm text-destructive">{getApiErrorMessage(eventQuery.error)}</p>
        )}

        {(!isEdit || eventQuery.data) && (
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
                    placeholder="Resumo exibido nos cartões do site"
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
                    <Input id="date" type="date" {...form.register("date")} />
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
                    <Input id="location" {...form.register("location")} />
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
                        onChange={field.onChange}
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
