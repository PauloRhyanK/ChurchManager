import { useCallback, useEffect, useRef, useState } from "react";
import type { SermonDoc } from "./document";

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

type SaveBody = { title?: string; document?: SermonDoc; baseRevision?: number };
type Pending = { title?: string; document?: SermonDoc };

interface UseAutosaveArgs {
  sermonId: string;
  initialRevision: number;
  save(body: SaveBody): Promise<{ revision: number }>;
  /**
   * Chamado num 409 com o que aquele envio levou. Se o servidor já tem exatamente isso (o envio gravou,
   * mas a resposta se perdeu), devolve a revisão do servidor e o salvamento segue; `null` = conflito de verdade.
   */
  resolveConflict?(sent: Pending): Promise<{ revision: number } | null>;
  delayMs?: number;
}

const DEFAULT_DELAY_MS = 1500;
/** Espera antes da nova tentativa automática depois de um 429 (limite de pedidos). */
export const THROTTLE_RETRY_MS = 5000;

function statusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === "number" ? status : null;
}

/**
 * Salvamento automático: junta as mudanças, salva `delayMs` depois da última e manda só o que mudou.
 * Uma chamada por vez; erro de rede espera o usuário (`retry`); 429 tenta de novo uma vez sozinho;
 * 409 sem acordo (`resolveConflict`) para tudo até recarregar.
 */
export function useAutosave({
  sermonId,
  initialRevision,
  save,
  resolveConflict,
  delayMs = DEFAULT_DELAY_MS,
}: UseAutosaveArgs) {
  const [state, setState] = useState<SaveState>("idle");
  /** Status HTTP do último erro (nulo quando não houve resposta). */
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const pending = useRef<Pending>({});
  const revision = useRef(initialRevision);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const failed = useRef(false);
  const conflict = useRef(false);
  /** Esperando a nova tentativa depois de um 429; `throttleRetried` = essa tentativa já foi gasta. */
  const waiting = useRef(false);
  const throttleRetried = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const resolveRef = useRef(resolveConflict);
  resolveRef.current = resolveConflict;

  const mounted = useRef(true);
  const update = (next: SaveState) => {
    if (mounted.current) setState(next);
  };

  // Outra palavra: recomeça do zero. A revisão vem só daqui; depois quem manda é a devolvida pelo servidor
  // (recarregar remonta o editor com `key`, então o hook nasce de novo).
  useEffect(() => {
    revision.current = initialRevision;
    pending.current = {};
    failed.current = false;
    conflict.current = false;
    waiting.current = false;
    throttleRetried.current = false;
    setState("idle");
    setErrorStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sermonId]);

  const hasPending = () => pending.current.title !== undefined || pending.current.document !== undefined;

  const run = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (conflict.current || waiting.current || !hasPending()) return Promise.resolve();
    const taken = pending.current;
    pending.current = {};
    const body: SaveBody = {};
    if (taken.title !== undefined) body.title = taken.title;
    if (taken.document !== undefined) {
      body.document = taken.document;
      body.baseRevision = revision.current;
    }
    failed.current = false;
    update("saving");
    const task = (async () => {
      let status: number | null = null;
      let saved = false;
      try {
        try {
          const result = await Promise.resolve().then(() => saveRef.current(body));
          revision.current = result.revision;
          saved = true;
        } catch (error) {
          status = statusOf(error);
          const resolve = resolveRef.current;
          if (status === 409 && resolve) {
            const resolved = await Promise.resolve()
              .then(() => resolve({ ...taken }))
              .catch(() => null);
            if (resolved) {
              revision.current = resolved.revision;
              saved = true;
            }
          }
        }
      } finally {
        inFlight.current = null;
      }
      if (!saved) {
        // O que não foi salvo volta para a fila, sem passar por cima do que mudou depois.
        pending.current = { ...taken, ...pending.current };
        if (status === 409) {
          conflict.current = true;
          update("conflict");
          return;
        }
        if (status === 429 && !throttleRetried.current) {
          throttleRetried.current = true;
          waiting.current = true;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            waiting.current = false;
            void run();
          }, THROTTLE_RETRY_MS);
          update("saving");
          return;
        }
        throttleRetried.current = false;
        failed.current = true;
        if (mounted.current) setErrorStatus(status);
        update("error");
        return;
      }
      throttleRetried.current = false;
      if (hasPending()) {
        // Mudou durante o salvamento: se o prazo já passou, salva já; senão o timer pendente cuida.
        if (!timer.current) await run();
        else update("saving");
      } else {
        update("saved");
      }
    })();
    inFlight.current = task;
    return task;
  }, []);

  const schedule = useCallback(() => {
    // Na espera do 429, a nova tentativa já leva o que mudar até lá.
    if (conflict.current || waiting.current) return;
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
    waiting.current = false;
    if (inFlight.current) await inFlight.current;
    if (!failed.current) await run();
  }, [run]);

  const retry = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    waiting.current = false;
    failed.current = false;
    void run();
  }, [run]);

  useEffect(() => {
    mounted.current = true;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasPending() && !inFlight.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      waiting.current = false;
      mounted.current = false;
      // Saiu da página com mudança pendente: manda uma vez, sem mexer em estado (se já há um salvamento
      // em andamento, ele mesmo manda o resto quando terminar, pois o timer foi limpo).
      if (!conflict.current && hasPending()) void run();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Há algo que o servidor ainda não confirmou. */
  const isDirty = useCallback(() => hasPending() || inFlight.current !== null, []);

  return { state, errorStatus, setTitle, setDocument, flush, retry, isDirty };
}
