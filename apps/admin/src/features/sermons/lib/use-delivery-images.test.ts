import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeliveryImages, type DeliveryImagesSource } from "./use-delivery-images";

const sync = vi.hoisted(() => ({ syncDeliveryImages: vi.fn() }));
vi.mock("./delivery-images", () => sync);

const DELIVERY = { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" };
const base: DeliveryImagesSource = { id: "s1", delivery: DELIVERY, updatedAt: "2026-11-19T10:00:00.000Z" };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const DONE = { total: 3, missing: 3, uploaded: 3, failed: 0 };

describe("useDeliveryImages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sync.syncDeliveryImages.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("sem envio não roda", async () => {
    renderHook(() => useDeliveryImages({ ...base, delivery: null }));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(sync.syncDeliveryImages).not.toHaveBeenCalled();
  });

  it("sem permissão de editar não roda", async () => {
    renderHook(() => useDeliveryImages(base, false));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(sync.syncDeliveryImages).not.toHaveBeenCalled();
  });

  it("roda 1,5 s depois de a palavra ter envio e mostra o progresso e o fim", async () => {
    const run = deferred<typeof DONE>();
    let report!: (p: { done: number; missing: number }) => void;
    sync.syncDeliveryImages.mockImplementation((_id: string, onProgress: typeof report) => {
      report = onProgress;
      return run.promise;
    });
    const { result } = renderHook(() => useDeliveryImages(base));
    await act(() => vi.advanceTimersByTimeAsync(1400));
    expect(sync.syncDeliveryImages).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(sync.syncDeliveryImages).toHaveBeenCalledWith("s1", expect.any(Function));
    act(() => report({ done: 1, missing: 3 }));
    expect(result.current.state).toEqual({ phase: "running", done: 1, missing: 3 });
    await act(async () => run.resolve(DONE));
    expect(result.current.state).toEqual({ phase: "ready" });
  });

  it("depois de salvar (updatedAt novo) roda de novo; mudança no meio de uma rodada pede outra no fim, nunca ao mesmo tempo", async () => {
    const first = deferred<typeof DONE>();
    sync.syncDeliveryImages.mockReturnValueOnce(first.promise).mockResolvedValue(DONE);
    const { rerender } = renderHook((s: DeliveryImagesSource) => useDeliveryImages(s), { initialProps: base });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(sync.syncDeliveryImages).toHaveBeenCalledTimes(1);

    rerender({ ...base, updatedAt: "2026-11-19T10:01:00.000Z" });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    // A primeira ainda corre: a segunda espera.
    expect(sync.syncDeliveryImages).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(DONE));
    expect(sync.syncDeliveryImages).toHaveBeenCalledTimes(2);

    rerender({ ...base, updatedAt: "2026-11-19T10:02:00.000Z" });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(sync.syncDeliveryImages).toHaveBeenCalledTimes(3);
  });

  it("falha mostra 'falhou' e tentar de novo roda outra vez", async () => {
    sync.syncDeliveryImages.mockResolvedValueOnce({ total: 3, missing: 3, uploaded: 2, failed: 1 }).mockResolvedValue(DONE);
    const { result } = renderHook(() => useDeliveryImages(base));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.state).toEqual({ phase: "failed" });
    await act(async () => result.current.retry());
    expect(sync.syncDeliveryImages).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ phase: "ready" });
  });

  it("erro ao ler a lista também é falha", async () => {
    sync.syncDeliveryImages.mockRejectedValue(new Error("rede"));
    const { result } = renderHook(() => useDeliveryImages(base));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.state).toEqual({ phase: "failed" });
  });
});
