import { useCallback, useEffect, useRef, useState } from "react";
import type { SermonDoc } from "./document";

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

type SaveBody = { title?: string; document?: SermonDoc; baseRevision?: number };
type Pending = { title?: string; document?: SermonDoc };

interface UseAutosaveArgs {
  sermonId: string;
  initialRevision: number;
  save(body: SaveBody): Promise<{ revision: number }>;
  delayMs?: number;
}

const DEFAULT_DELAY_MS = 1500;

function isConflict(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 409;
}

/**
 * Salvamento automático: junta as mudanças, salva `delayMs` depois da última e manda só o que mudou.
 * Uma chamada por vez; erro de rede espera o usuário (`retry`); 409 para tudo até recarregar.
 */
export function useAutosave({ sermonId, initialRevision, save, delayMs = DEFAULT_DELAY_MS }: UseAutosaveArgs) {
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef<Pending>({});
  const revision = useRef(initialRevision);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const failed = useRef(false);
  const conflict = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  // Outra palavra (ou recarregada pelo servidor): recomeça do zero.
  useEffect(() => {
    revision.current = initialRevision;
    pending.current = {};
    failed.current = false;
    conflict.current = false;
    setState("idle");
  }, [sermonId, initialRevision]);

  const hasPending = () => pending.current.title !== undefined || pending.current.document !== undefined;

  const run = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (conflict.current || !hasPending()) return Promise.resolve();
    const taken = pending.current;
    pending.current = {};
    const body: SaveBody = {};
    if (taken.title !== undefined) body.title = taken.title;
    if (taken.document !== undefined) {
      body.document = taken.document;
      body.baseRevision = revision.current;
    }
    failed.current = false;
    setState("saving");
    const task = (async () => {
      try {
        const result = await saveRef.current(body);
        revision.current = result.revision;
      } catch (error) {
        // O que não foi salvo volta para a fila, sem passar por cima do que mudou depois.
        pending.current = { ...taken, ...pending.current };
        if (isConflict(error)) conflict.current = true;
        else failed.current = true;
        setState(conflict.current ? "conflict" : "error");
        return;
      } finally {
        inFlight.current = null;
      }
      if (hasPending()) {
        // Mudou durante o salvamento: se o prazo já passou, salva já; senão o timer pendente cuida.
        if (!timer.current) await run();
        else setState("saving");
      } else {
        setState("saved");
      }
    })();
    inFlight.current = task;
    return task;
  }, []);

  const schedule = useCallback(() => {
    if (conflict.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (failed.current) return;
      void run();
    }, delayMs);
  }, [delayMs, run]);

  const setTitle = useCallback(
    (title: string) => {
      if (conflict.current) return;
      pending.current = { ...pending.current, title };
      schedule();
    },
    [schedule],
  );

  const setDocument = useCallback(
    (document: SermonDoc) => {
      if (conflict.current) return;
      pending.current = { ...pending.current, document };
      schedule();
    },
    [schedule],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) await inFlight.current;
    if (!failed.current) await run();
  }, [run]);

  const retry = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    failed.current = false;
    void run();
  }, [run]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasPending() && !inFlight.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** Há algo que o servidor ainda não confirmou. */
  const isDirty = useCallback(() => hasPending() || inFlight.current !== null, []);

  return { state, setTitle, setDocument, flush, retry, isDirty };
}
