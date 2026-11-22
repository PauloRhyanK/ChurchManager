import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, put, post: vi.fn(), delete: vi.fn() } }));

import { fetchLyricsSettings, saveLyricsSettings } from "./worship-api";

describe("padrão dos slides das músicas", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("consulta os limites da igreja", async () => {
    get.mockResolvedValue({ data: { lyricMaxChars: 28, lyricMaxLines: 3 } });
    await expect(fetchLyricsSettings()).resolves.toEqual({ lyricMaxChars: 28, lyricMaxLines: 3 });
    expect(get).toHaveBeenCalledWith("/admin/tenants/me/worship/timing/lyrics-settings");
  });

  it("envia apenas os dois limites numéricos", async () => {
    put.mockResolvedValue({ data: { lyricMaxChars: 24, lyricMaxLines: 2 } });
    await saveLyricsSettings(24, 2);
    expect(put).toHaveBeenCalledWith("/admin/tenants/me/worship/timing/lyrics-settings", { lyricMaxChars: 24, lyricMaxLines: 2 });
  });
});
