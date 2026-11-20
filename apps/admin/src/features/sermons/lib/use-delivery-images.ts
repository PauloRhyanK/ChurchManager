// Mantém as imagens da cópia entregue em dia: roda quando a palavra tem envio e a cópia muda (updatedAt ou envio),
// 1,5 s depois da última mudança. Uma rodada por vez; mudança no meio de uma rodada pede outra no fim.
import { useCallback, useEffect, useRef, useState } from "react";
import { syncDeliveryImages } from "./delivery-images";

export const DELIVERY_IMAGES_DELAY_MS = 1500;

export type DeliveryImagesState =
  | { phase: "idle" }
  | { phase: "running"; done: number; missing: number }
  | { phase: "ready" }
  | { phase: "failed" };

export type DeliveryImagesSource = {
  id: string;
  /** O envio (ou null): a sincronização só roda com envio. */
  delivery: unknown;
  updatedAt: string;
};

export function useDeliveryImages(sermon: DeliveryImagesSource | null, enabled = true) {
  const [state, setState] = useState<DeliveryImagesState>({ phase: "idle" });
  const active = !!(enabled && sermon && sermon.delivery);
  const key = active && sermon ? JSON.stringify([sermon.id, sermon.updatedAt, sermon.delivery]) : null;
  const idRef = useRef<string | null>(null);
  idRef.current = active && sermon ? sermon.id : null;
  const running = useRef(false);
  const again = useRef(false);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      let last: DeliveryImagesState = { phase: "idle" };
      do {
        again.current = false;
        const id = idRef.current;
        if (!id) {
          last = { phase: "idle" };
          break;
        }
        if (mounted.current) setState({ phase: "running", done: 0, missing: 0 });
        try {
          const result = await syncDeliveryImages(id, (p) => {
            if (mounted.current) setState({ phase: "running", done: p.done, missing: p.missing });
          });
          last = result.failed > 0 ? { phase: "failed" } : result.total > 0 ? { phase: "ready" } : { phase: "idle" };
        } catch {
          last = { phase: "failed" };
        }
      } while (again.current && mounted.current);
      if (mounted.current) setState(last);
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (key === null) {
      if (!running.current) setState({ phase: "idle" });
      return;
    }
    const timer = setTimeout(() => void run(), DELIVERY_IMAGES_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, run]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retry = useCallback(() => void run(), [run]);
  return { state, retry };
}
