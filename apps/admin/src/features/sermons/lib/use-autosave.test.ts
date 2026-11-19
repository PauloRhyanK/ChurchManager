import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SermonDoc } from "./document";
import { useAutosave } from "./use-autosave";

const docA: SermonDoc = { type: "doc", content: [{ type: "paragraph" }] };
const docB: SermonDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "oi" }] }] };

function setup(save: ReturnType<typeof vi.fn>) {
  return renderHook(() => useAutosave({ sermonId: "s1", initialRevision: 3, save, delayMs: 1500 }));
}

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("junta mudanças e salva 1,5 s depois da última, com a revisão inicial", async () => {
    const save = vi.fn().mockResolvedValue({ revision: 4 });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    act(() => result.current.setDocument(docB));
    await act(() => vi.advanceTimersByTimeAsync(1400));
    expect(save).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ document: docB, baseRevision: 3 });
    expect(result.current.state).toBe("saved");
  });

  it("a chamada seguinte usa a revisão devolvida", async () => {
    const save = vi.fn().mockResolvedValueOnce({ revision: 4 }).mockResolvedValueOnce({ revision: 5 });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    act(() => result.current.setDocument(docB));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(save).toHaveBeenNthCalledWith(2, { document: docB, baseRevision: 4 });
  });

  it("mudança durante o salvamento gera outra chamada depois, nunca duas ao mesmo tempo", async () => {
    let release: (v: { revision: number }) => void = () => {};
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValueOnce({ revision: 5 });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.state).toBe("saving");
    act(() => result.current.setDocument(docB));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => release({ revision: 4 }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, { document: docB, baseRevision: 4 });
  });

  it("erro de rede vira error, não repete sozinho e retry reenvia o mesmo corpo", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ revision: 4 });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.state).toBe("error");
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(save).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, { document: docA, baseRevision: 3 });
    expect(result.current.state).toBe("saved");
  });

  it("409 vira conflict e nenhuma chamada nova depois de outra mudança", async () => {
    const save = vi.fn().mockRejectedValue({ response: { status: 409 } });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.state).toBe("conflict");
    act(() => result.current.setDocument(docB));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("conflict");
  });

  it("mudar só o título não manda document nem baseRevision", async () => {
    const save = vi.fn().mockResolvedValue({ revision: 4 });
    const { result } = setup(save);
    act(() => result.current.setTitle("Novo"));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(save).toHaveBeenCalledWith({ title: "Novo" });
  });

  it("flush salva na hora o que está pendente", async () => {
    const save = vi.fn().mockResolvedValue({ revision: 4 });
    const { result } = setup(save);
    act(() => result.current.setTitle("Novo"));
    act(() => result.current.setDocument(docA));
    await act(() => result.current.flush());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "Novo", document: docA, baseRevision: 3 });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("unmount com mudança pendente envia a mudança", async () => {
    const save = vi.fn().mockResolvedValue({ revision: 4 });
    const { result, unmount } = setup(save);
    act(() => result.current.setDocument(docA));
    unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ document: docA, baseRevision: 3 });
  });

  it("unmount em conflito não envia", async () => {
    const save = vi.fn().mockRejectedValue({ response: { status: 409 } });
    const { result, unmount } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("mudar initialRevision com mudança pendente não descarta nem troca a revisão", async () => {
    const save = vi.fn().mockResolvedValue({ revision: 4 });
    const { result, rerender } = renderHook(
      ({ rev }) => useAutosave({ sermonId: "s1", initialRevision: rev, save, delayMs: 1500 }),
      { initialProps: { rev: 3 } },
    );
    act(() => result.current.setDocument(docA));
    rerender({ rev: 9 });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(save).toHaveBeenCalledWith({ document: docA, baseRevision: 3 });
  });

  it("save que lança de forma síncrona não trava as próximas tentativas", async () => {
    const save = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockResolvedValueOnce({ revision: 4 });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.state).toBe("error");
    act(() => result.current.retry());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("saved");
  });

  it("erro HTTP 400 vira error, sem nova tentativa automática", async () => {
    const save = vi.fn().mockRejectedValue({ response: { status: 400 } });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(result.current.state).toBe("error");
    expect(save).toHaveBeenCalledTimes(1);
  });

  describe("409 depois de um envio que gravou mas cuja resposta se perdeu", () => {
    it("resolveConflict com o mesmo conteúdo no servidor: adota a revisão e segue salvando", async () => {
      const save = vi
        .fn()
        .mockRejectedValueOnce({ response: { status: 409 } })
        .mockResolvedValueOnce({ revision: 8 });
      const resolveConflict = vi.fn().mockResolvedValue({ revision: 7 });
      const { result } = renderHook(() =>
        useAutosave({ sermonId: "s1", initialRevision: 3, save, resolveConflict, delayMs: 1500 }),
      );
      act(() => result.current.setTitle("Novo"));
      act(() => result.current.setDocument(docA));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(resolveConflict).toHaveBeenCalledWith({ title: "Novo", document: docA });
      expect(result.current.state).toBe("saved");
      expect(result.current.isDirty()).toBe(false);
      act(() => result.current.setDocument(docB));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(save).toHaveBeenNthCalledWith(2, { document: docB, baseRevision: 7 });
      expect(result.current.state).toBe("saved");
    });

    it("mudança feita enquanto resolvia vai no envio seguinte", async () => {
      let resolve: (v: { revision: number }) => void = () => {};
      const save = vi
        .fn()
        .mockRejectedValueOnce({ response: { status: 409 } })
        .mockResolvedValueOnce({ revision: 8 });
      const resolveConflict = vi.fn().mockImplementation(() => new Promise((r) => (resolve = r)));
      const { result } = renderHook(() =>
        useAutosave({ sermonId: "s1", initialRevision: 3, save, resolveConflict, delayMs: 1500 }),
      );
      act(() => result.current.setDocument(docA));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      act(() => result.current.setDocument(docB));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await act(async () => resolve({ revision: 7 }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(save).toHaveBeenNthCalledWith(2, { document: docB, baseRevision: 7 });
      expect(result.current.state).toBe("saved");
    });

    it("resolveConflict sem acordo (null) ou com falha: entra em conflict", async () => {
      for (const resolveConflict of [vi.fn().mockResolvedValue(null), vi.fn().mockRejectedValue(new Error("rede"))]) {
        const save = vi.fn().mockRejectedValue({ response: { status: 409 } });
        const { result, unmount } = renderHook(() =>
          useAutosave({ sermonId: "s1", initialRevision: 3, save, resolveConflict, delayMs: 1500 }),
        );
        act(() => result.current.setDocument(docA));
        await act(() => vi.advanceTimersByTimeAsync(1500));
        expect(resolveConflict).toHaveBeenCalledWith({ document: docA });
        expect(result.current.state).toBe("conflict");
        expect(result.current.isDirty()).toBe(true);
        unmount();
      }
    });
  });

  it("errorStatus diz o status HTTP do último erro (null em erro de rede)", async () => {
    for (const [error, status] of [
      [{ response: { status: 413 } }, 413],
      [{ response: { status: 400 } }, 400],
      [new Error("rede"), null],
    ] as const) {
      const save = vi.fn().mockRejectedValue(error);
      const { result, unmount } = setup(save);
      act(() => result.current.setDocument(docA));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(result.current.state).toBe("error");
      expect(result.current.errorStatus).toBe(status);
      unmount();
    }
  });

  it("429 espera 5 s e tenta de novo sozinho uma vez", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce({ revision: 4 });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.state).toBe("saving");
    // Digitar durante a espera não adianta a nova tentativa.
    act(() => result.current.setDocument(docB));
    await act(() => vi.advanceTimersByTimeAsync(4900));
    expect(save).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, { document: docB, baseRevision: 3 });
    expect(result.current.state).toBe("saved");
  });

  it("429 de novo depois da nova tentativa vira error", async () => {
    const save = vi.fn().mockRejectedValue({ response: { status: 429 } });
    const { result } = setup(save);
    act(() => result.current.setDocument(docA));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("error");
    expect(result.current.errorStatus).toBe(429);
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(save).toHaveBeenCalledTimes(2);
  });
});
