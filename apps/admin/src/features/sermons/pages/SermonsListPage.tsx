import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronRight, ClipboardPaste, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { createSermon, listSermons, type SermonStatus } from "../api/sermons-api";
import { PasteTextDialog } from "../components/PasteTextDialog";
import { SituationLabel } from "../components/SituationLabel";
import { formatBase } from "../lib/format";

type Filter = "ALL" | SermonStatus;

const SEARCH_DELAY_MS = 300;

export default function SermonsListPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canEdit = can("SERMONS", "EDIT");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const status = filter === "ALL" ? undefined : filter;
  const sermonsQuery = useQuery({
    queryKey: ["sermons", "list", q, status ?? "ALL"],
    queryFn: () => listSermons({ q, status }),
    placeholderData: (previous) => previous,
  });
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: () => createSermon({}),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["sermons", "list"] });
      navigate(`/palavras/${created.id}`);
    },
  });

  const items = sermonsQuery.data?.items ?? [];
  const counts = sermonsQuery.data?.counts ?? { all: 0, draft: 0, sent: 0, preached: 0 };
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "Todas", count: counts.all },
    { key: "DRAFT", label: "Rascunhos", count: counts.draft },
    { key: "SENT", label: "Enviadas", count: counts.sent },
    { key: "PREACHED", label: "Pregadas", count: counts.preached },
  ];

  const newButton = canEdit && (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="gap-2" onClick={() => setPasteOpen(true)}>
        <ClipboardPaste className="h-4 w-4" />
        Colar texto
      </Button>
      <Button className="gap-2" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
        <Plus className="h-4 w-4" />
        Nova palavra
      </Button>
    </div>
  );
  const noFilter = q === "" && filter === "ALL";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Palavras</h1>
          {newButton}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Procurar palavra"
              placeholder="Título ou versículo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div role="group" aria-label="Filtrar por situação" className="flex gap-0.5 rounded-xl bg-muted p-1">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? "min-h-9 rounded-lg bg-background px-3.5 text-sm font-semibold shadow-sm"
                    : "min-h-9 rounded-lg px-3.5 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {f.label} {f.count}
              </button>
            ))}
          </div>
        </div>

        {(sermonsQuery.error || createMutation.error) && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {getApiErrorMessage(sermonsQuery.error ?? createMutation.error)}
          </p>
        )}

        {sermonsQuery.isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando" />
          </div>
        ) : !sermonsQuery.error && items.length === 0 ? (
          noFilter ? (
            <div className="rounded-xl border bg-card px-6 py-14 text-center">
              <p className="font-semibold">Você ainda não escreveu nenhuma palavra.</p>
              {canEdit && <div className="mt-5 flex justify-center">{newButton}</div>}
            </div>
          ) : (
            <p className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              Nenhuma palavra encontrada.
            </p>
          )
        ) : (
          <ul className="overflow-hidden rounded-xl border bg-card">
            {items.map((sermon, i) => (
              <li key={sermon.id} className={i === 0 ? "" : "border-t"}>
                <Link to={`/palavras/${sermon.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/40">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{sermon.title}</span>
                    <span className="text-[13px] text-muted-foreground">{formatBase(sermon)}</span>
                  </span>
                  <SituationLabel sermon={sermon} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canEdit && (
        <PasteTextDialog
          open={pasteOpen}
          onOpenChange={setPasteOpen}
          onCreated={(created) => {
            void queryClient.invalidateQueries({ queryKey: ["sermons", "list"] });
            navigate(`/palavras/${created.id}`);
          }}
        />
      )}
    </DashboardLayout>
  );
}
