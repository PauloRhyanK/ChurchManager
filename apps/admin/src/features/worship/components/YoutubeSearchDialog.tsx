import { useState } from "react";
import { Loader2, Music, Search, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import { searchYoutube, type YoutubeSearchResult } from "../api/worship-api";
import { formatClock } from "../lib/format";

interface YoutubeSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  onImport: (urlOrId: string) => Promise<void>;
}

export function YoutubeSearchDialog({
  open,
  onOpenChange,
  initialQuery = "",
  onImport,
}: YoutubeSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<YoutubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;

    // Se o usuário colou uma URL direta do YouTube, importa direto
    if (q.includes("youtube.com/") || q.includes("youtu.be/")) {
      await handleImport(q);
      return;
    }

    setSearching(true);
    try {
      const items = await searchYoutube(q);
      setResults(items);
      if (items.length === 0) {
        toast.info("Nenhum vídeo encontrado para esta busca.");
      }
    } catch (err) {
      toast.error(`Erro ao buscar no YouTube: ${getApiErrorMessage(err)}`);
    } finally {
      setSearching(false);
    }
  }

  async function handleImport(urlOrId: string) {
    setImportingId(urlOrId);
    try {
      await onImport(urlOrId);
      onOpenChange(false);
      setResults([]);
    } catch (err) {
      toast.error(`Não foi possível importar: ${getApiErrorMessage(err)}`);
    } finally {
      setImportingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (importingId ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-600" />
            Buscar música no YouTube
          </DialogTitle>
          <DialogDescription>
            Digite o nome da música ou cole o link do YouTube. Vamos extrair o áudio de referência e a letra para sincronização.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Gratidão Felipe Rodrigues ou link do vídeo…"
              className="pl-9"
              disabled={searching || !!importingId}
            />
          </div>
          <Button type="submit" disabled={!query.trim() || searching || !!importingId} className="gap-2">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
          </Button>
        </form>

        {importingId && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-primary/20 bg-primary/5 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="flex flex-col gap-1">
              <b className="text-sm">Baixando e processando do YouTube…</b>
              <span className="text-xs text-muted-foreground">
                Convertendo áudio de referência e extraindo legendas. Aguarde alguns segundos.
              </span>
            </div>
          </div>
        )}

        {!importingId && results.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Resultados encontrados:</span>
            <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
              {results.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt=""
                        className="h-12 w-20 flex-none rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-20 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Music className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-col">
                      <b className="truncate text-sm leading-tight" title={video.title}>
                        {video.title}
                      </b>
                      <span className="truncate text-xs text-muted-foreground">
                        {video.channel ?? "Canal do YouTube"} · {formatClock(video.durationSeconds)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="flex-none gap-1.5"
                    disabled={!!importingId}
                    onClick={() => handleImport(video.id)}
                  >
                    Usar no louvor
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
