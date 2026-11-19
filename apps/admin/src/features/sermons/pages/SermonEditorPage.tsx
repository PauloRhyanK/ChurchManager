import { useMutation, useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { ArrowLeft, Check, Clock, ListTree, Loader2, MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { deleteSermon, duplicateSermon, getSermon, updateSermon, type Sermon } from "../api/sermons-api";
import { StructurePanel } from "../components/StructurePanel";
import { SermonSheet } from "../editor/SermonSheet";
import { SermonToolbar } from "../editor/SermonToolbar";
import { deriveSermon, type SermonDoc } from "../lib/document";
import { formatDay, formatHour, formatSpeech } from "../lib/format";
import { useAutosave } from "../lib/use-autosave";

const LIST_PATH = "/palavras";

/** Id da seção onde está o cursor: o último Ponto ou Título de seção até a posição; nulo na Abertura. */
function sectionAtCursor(editor: Editor): string | null {
  const { from } = editor.state.selection;
  let active: string | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (offset > from) return;
    const opens = node.type.name === "point" || (node.type.name === "heading" && node.attrs.level === 2);
    if (opens) active = (node.attrs.id as string) ?? null;
  });
  return active;
}

/** Rola a folha até o bloco com esse id (nulo = topo). */
function scrollToBlock(editor: Editor | null, id: string | null) {
  if (!editor) return;
  if (id === null) {
    editor.view.dom.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs?.id === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) return;
  const dom = editor.view.nodeDOM(found);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SaveIndicator({ state, onRetry, onReload }: { state: string; onRetry(): void; onReload(): void }) {
  if (state === "saving")
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm text-[#6B7280]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Salvando…
      </span>
    );
  if (state === "saved")
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm text-[#6B7280]">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Salvo
      </span>
    );
  if (state === "error")
    return (
      <span role="alert" className="flex items-center gap-2 text-sm text-destructive">
        Não foi possível salvar.
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      </span>
    );
  if (state === "conflict")
    return (
      <span role="alert" className="flex items-center gap-2 text-sm text-destructive">
        Esta palavra foi alterada em outra aba.
        <Button type="button" variant="outline" size="sm" onClick={onReload}>
          Recarregar
        </Button>
      </span>
    );
  return null;
}

interface EditorViewProps {
  sermon: Sermon;
  canEdit: boolean;
  onReload(): void;
}

function EditorView({ sermon, canEdit, onReload }: EditorViewProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(sermon.title);
  const [doc, setDoc] = useState<SermonDoc>(sermon.document);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const autosave = useAutosave({
    sermonId: sermon.id,
    initialRevision: sermon.revision,
    save: async (body) => {
      const saved = await updateSermon(sermon.id, body);
      return { revision: saved.revision };
    },
  });

  const derived = useMemo(() => deriveSermon(doc), [doc]);

  useEffect(() => {
    if (!editor) return;
    const sync = () => setActiveId(sectionAtCursor(editor));
    sync();
    editor.on("selectionUpdate", sync);
    editor.on("update", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("update", sync);
    };
  }, [editor]);

  const handleTitle = useCallback(
    (value: string) => {
      setTitle(value);
      if (canEdit) autosave.setTitle(value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, autosave.setTitle],
  );
  const handleDocument = useCallback(
    (next: SermonDoc) => {
      setDoc(next);
      if (canEdit) autosave.setDocument(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, autosave.setDocument],
  );

  async function goBack() {
    await autosave.flush();
    if (!autosave.isDirty()) navigate(LIST_PATH);
  }

  const duplicate = useMutation({
    mutationFn: async () => {
      await autosave.flush();
      return duplicateSermon(sermon.id);
    },
    onSuccess: (copy) => navigate(`${LIST_PATH}/${copy.id}`),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => deleteSermon(sermon.id),
    onSuccess: () => navigate(LIST_PATH),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const select = (id: string | null) => {
    setDrawerOpen(false);
    // Espera a gaveta fechar para o foco não puxar a rolagem de volta.
    setTimeout(() => scrollToBlock(editor, id), 0);
  };

  const sentNotPreached = sermon.status === "SENT" && sermon.delivery !== null;
  const deleteDescription =
    sentNotPreached && sermon.delivery
      ? `Ela também sai do culto de ${formatDay(sermon.delivery.date)}, ${formatHour(sermon.delivery.startTime)}.`
      : "Esta ação não pode ser desfeita.";

  // Espaço para o botão "Enviar para um culto" (Tarefa 11), ao lado do menu "…".
  const headerActions = null;

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6]">
      <header className="sticky top-0 z-20 border-b border-[#E5E7EB] bg-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button type="button" variant="ghost" size="icon" aria-label="Voltar para Palavras" onClick={goBack}>
            <ArrowLeft aria-hidden="true" />
          </Button>
          <h1 className="min-w-0 truncate text-base font-semibold text-[#030712]">{title.trim() || "Sem título"}</h1>
          {canEdit && <SaveIndicator state={autosave.state} onRetry={autosave.retry} onReload={onReload} />}
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-[#F3F4F6] px-3 py-1 text-sm text-[#1F2937]">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatSpeech(derived.estimatedSeconds)}
            </span>
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 lg:hidden">
                  <ListTree aria-hidden="true" />
                  Estrutura
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] bg-[#F3F4F6]">
                <SheetTitle className="sr-only">Estrutura</SheetTitle>
                <SheetDescription className="sr-only">Seções e versículos da palavra.</SheetDescription>
                <StructurePanel derived={derived} activeId={activeId} onSelect={select} className="mt-6" />
              </SheetContent>
            </Sheet>
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Mais ações">
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => duplicate.mutate()}>Duplicar</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onSelect={() => setDeleteOpen(true)}>
                    Apagar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {headerActions}
          </div>
        </div>
        {canEdit && editor && (
          <div className="border-t border-[#E5E7EB] px-4 py-1.5">
            <SermonToolbar editor={editor} />
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 items-start gap-6 px-4 py-8">
        <aside className="sticky top-32 hidden w-[220px] shrink-0 lg:block">
          <StructurePanel derived={derived} activeId={activeId} onSelect={select} />
        </aside>
        <main className="min-w-0 flex-1">
          <SermonSheet
            title={title}
            document={sermon.document}
            editable={canEdit}
            onTitleChange={handleTitle}
            onDocumentChange={handleDocument}
            onEditor={setEditor}
          />
        </main>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta palavra?</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Apagar palavra</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function SermonEditorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const canEdit = can("SERMONS", "EDIT");
  // A cópia do servidor só abre o editor: depois disso quem manda é o editor.
  const sermonQuery = useQuery({
    queryKey: ["sermons", "detail", id],
    queryFn: () => getSermon(id),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const [loadKey, setLoadKey] = useState(0);

  const reload = useCallback(async () => {
    const result = await sermonQuery.refetch();
    if (result.data) setLoadKey((k) => k + 1);
  }, [sermonQuery]);

  if (sermonQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6]" role="status" aria-label="Carregando">
        <Loader2 className="h-6 w-6 animate-spin text-[#6B7280]" aria-hidden="true" />
      </div>
    );
  }
  if (sermonQuery.isError || !sermonQuery.data) {
    const notFound = (sermonQuery.error as { response?: { status?: number } } | null)?.response?.status === 404;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F3F4F6] p-6 text-center">
        <p className="text-lg font-semibold text-[#030712]">
          {notFound ? "Palavra não encontrada." : getApiErrorMessage(sermonQuery.error)}
        </p>
        <Link to={LIST_PATH} className="text-sm font-medium text-primary underline">
          Voltar para Palavras
        </Link>
      </div>
    );
  }
  return <EditorView key={loadKey} sermon={sermonQuery.data} canEdit={canEdit} onReload={reload} />;
}
