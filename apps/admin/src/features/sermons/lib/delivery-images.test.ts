import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncDeliveryImages } from "./delivery-images";
import type { PublicSlide } from "./slides";

const api = vi.hoisted(() => ({ getDeliveryImages: vi.fn(), uploadDeliveryImage: vi.fn() }));
vi.mock("../api/sermons-api", () => api);
const raster = vi.hoisted(() => ({ renderSlidePng: vi.fn(), loadSlideFonts: vi.fn() }));
vi.mock("./slide-raster", () => raster);

const slide = (title: string): PublicSlide => ({ kind: "POINT", text: title, layout: "TITLE", title, verse: null, reference: null, items: null, start: null });

const LIST = {
  style: "MINIMAL",
  version: "0123456789abcdef",
  slides: [
    { index: 0, hash: "aaaaaaaaaaaaaaaa", slide: slide("Capa"), imageUrl: "https://cdn/a.png" },
    { index: 1, hash: "bbbbbbbbbbbbbbbb", slide: slide("Ponto 1"), imageUrl: null },
    { index: 2, hash: "cccccccccccccccc", slide: slide("Ponto 2"), imageUrl: null },
    { index: 3, hash: "dddddddddddddddd", slide: slide("Ponto 3"), imageUrl: null },
  ],
};

function notFound() {
  return new AxiosError("404", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 404,
    statusText: "Not Found",
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  raster.loadSlideFonts.mockResolvedValue(undefined);
  raster.renderSlidePng.mockImplementation(async (s: PublicSlide) => new Blob([s.title], { type: "image/png" }));
  api.uploadDeliveryImage.mockImplementation(async (_id: string, hash: string) => ({ hash, imageUrl: `https://cdn/${hash}.png` }));
});

describe("syncDeliveryImages", () => {
  it("desenha e envia só os slides sem imagem, um de cada vez", async () => {
    api.getDeliveryImages.mockResolvedValue(LIST);
    let inFlight = 0;
    let maxInFlight = 0;
    api.uploadDeliveryImage.mockImplementation(async (_id: string, hash: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { hash, imageUrl: `https://cdn/${hash}.png` };
    });
    const progress = vi.fn();

    const result = await syncDeliveryImages("s1", progress);

    expect(result).toEqual({ total: 4, missing: 3, uploaded: 3, failed: 0 });
    expect(api.getDeliveryImages).toHaveBeenCalledWith("s1");
    expect(raster.renderSlidePng.mock.calls.map((c) => [c[0].title, c[1]])).toEqual([
      ["Ponto 1", "MINIMAL"],
      ["Ponto 2", "MINIMAL"],
      ["Ponto 3", "MINIMAL"],
    ]);
    expect(api.uploadDeliveryImage.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["s1", "bbbbbbbbbbbbbbbb"],
      ["s1", "cccccccccccccccc"],
      ["s1", "dddddddddddddddd"],
    ]);
    expect(api.uploadDeliveryImage.mock.calls[0][2]).toBeInstanceOf(Blob);
    expect(maxInFlight).toBe(1);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { done: 0, missing: 3 },
      { done: 1, missing: 3 },
      { done: 2, missing: 3 },
      { done: 3, missing: 3 },
    ]);
  });

  it("conta as falhas e segue para os próximos", async () => {
    api.getDeliveryImages.mockResolvedValue(LIST);
    raster.renderSlidePng.mockImplementationOnce(async () => {
      throw new Error("canvas");
    });
    api.uploadDeliveryImage.mockImplementationOnce(async (_id: string, hash: string) => ({ hash, imageUrl: "x" }));
    api.uploadDeliveryImage.mockImplementationOnce(async () => {
      throw new Error("413");
    });

    expect(await syncDeliveryImages("s1")).toEqual({ total: 4, missing: 3, uploaded: 1, failed: 2 });
    expect(api.uploadDeliveryImage).toHaveBeenCalledTimes(2);
  });

  it("com tudo pronto não desenha nada", async () => {
    api.getDeliveryImages.mockResolvedValue({ ...LIST, slides: [LIST.slides[0]] });
    expect(await syncDeliveryImages("s1")).toEqual({ total: 1, missing: 0, uploaded: 0, failed: 0 });
    expect(raster.loadSlideFonts).not.toHaveBeenCalled();
    expect(raster.renderSlidePng).not.toHaveBeenCalled();
  });

  it("sem a fonte, não envia nada e conta tudo como falha", async () => {
    api.getDeliveryImages.mockResolvedValue(LIST);
    raster.loadSlideFonts.mockRejectedValue(new Error("fonte"));
    expect(await syncDeliveryImages("s1")).toEqual({ total: 4, missing: 3, uploaded: 0, failed: 3 });
    expect(api.uploadDeliveryImage).not.toHaveBeenCalled();
  });

  it("palavra sem envio (404) não tem nada a fazer; outro erro sobe", async () => {
    api.getDeliveryImages.mockRejectedValueOnce(notFound());
    expect(await syncDeliveryImages("s1")).toEqual({ total: 0, missing: 0, uploaded: 0, failed: 0 });
    api.getDeliveryImages.mockRejectedValueOnce(new Error("rede"));
    await expect(syncDeliveryImages("s1")).rejects.toThrow("rede");
  });
});
