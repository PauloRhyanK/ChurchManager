import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Music, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { fetchSongs } from "../api/worship-api";
import { SituationBadge } from "../components/SituationBadge";
import { plain, songFicha } from "../lib/format";

type Filter = "ALL" | "READY" | "PENDING";

export default function SongsListPage() {
  const { can } = usePermissions();
  const canEdit = can("WORSHIP", "EDIT");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const songsQuery = useQuery({ queryKey: ["worship", "songs"], queryFn: fetchSongs });

  const all = songsQuery.data?.items ?? [];
  const counts = songsQuery.data?.counts ?? { all: 0, ready: 0, pending: 0 };
  const q = plain(search);
  const items = all.filter(
    (s) =>
      (!q || plain(s.title).includes(q)) &&
      (filter === "ALL" || (filter === "READY") === (s.status === "READY")),
  );

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "Todas", count: counts.all },
    { key: "READY", label: "Prontas", count: counts.ready },
    { key: "PENDING", label: "Pendentes", count: counts.pending },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Músicas</h1>
          {canEdit && (
            <Button asChild className="gap-2">
              <Link to="/cultos/musicas/nova">
                <Plus className="h-4 w-4" />
                Nova música
              </Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Procurar música"
              placeholder="Procurar"
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

        {songsQuery.error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {getApiErrorMessage(songsQuery.error)}
          </p>
        )}

        {songsQuery.isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando" />
          </div>
        ) : !songsQuery.error && all.length === 0 ? (
          <div className="rounded-xl border bg-card px-6 py-14 text-center">
            <p className="font-semibold">Nenhuma música no repertório ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cole a letra de uma música e a plataforma separa as partes e monta os slides.
            </p>
            {canEdit && (
              <Button asChild className="mt-5 gap-2">
                <Link to="/cultos/musicas/nova">
                  <Plus className="h-4 w-4" />
                  Nova música
                </Link>
              </Button>
            )}
          </div>
        ) : !songsQuery.error && items.length === 0 ? (
          <p className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhuma música com esse filtro.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border bg-card">
            {items.map((song, i) => (
              <li key={song.id} className={i === 0 ? "" : "border-t"}>
                <Link
                  to={`/cultos/musicas/${song.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/40"
                >
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Music className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{song.title}</span>
                    <span className="text-[13px] text-muted-foreground">{songFicha(song)}</span>
                  </span>
                  <SituationBadge status={song.status} pending={song.pending} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
