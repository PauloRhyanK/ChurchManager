import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createEvent,
  fetchEvent,
  updateEvent,
} from "@/features/events/api/tenant-events-api";
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
      description: "",
      date: "",
      timeStart: "",
      timeEnd: "",
      location: "",
      imageUrl: "",
      tag: "",
      published: true,
    },
  });

  useEffect(() => {
    if (eventQuery.data) {
      const e = eventQuery.data;
      form.reset({
        title: e.title,
        description: e.description ?? "",
        date: e.date,
        timeStart: e.timeStart?.slice(0, 5) ?? "",
        timeEnd: e.timeEnd?.slice(0, 5) ?? "",
        location: e.location ?? "",
        imageUrl: e.imageUrl ?? "",
        tag: e.tag ?? "",
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
                  <Label htmlFor="location">Local</Label>
                  <Input id="location" {...form.register("location")} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="imageUrl">URL da imagem</Label>
                    <Input id="imageUrl" type="url" {...form.register("imageUrl")} />
                    {form.formState.errors.imageUrl && (
                      <p className="text-sm text-red-600">
                        {form.formState.errors.imageUrl.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tag">Etiqueta</Label>
                    <Input id="tag" placeholder="Ex.: culto, retiro" {...form.register("tag")} />
                  </div>
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
