import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post: vi.fn(), put, delete: vi.fn() } }));

import { fetchProjectionAgenda, updateProjectionSettings } from "./projection-api";

describe("agenda do telão", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("lê a agenda do endpoint do painel", async () => {
    get.mockResolvedValue({ data: { items: [], days: 7, updatedAt: null } });
    await fetchProjectionAgenda();
    expect(get).toHaveBeenCalledWith("/admin/tenants/me/projection/agenda");
  });

  it("salva só as duas listas, sem campos extras", async () => {
    put.mockResolvedValue({ data: { items: [], days: 7, updatedAt: null } });
    const body = { hiddenEventIds: ["e1"], hiddenScheduleIds: ["s1"], extra: 1 } as never;
    await updateProjectionSettings(body);
    const [url, sent] = put.mock.calls[0];
    expect(url).toBe("/admin/tenants/me/projection/settings");
    expect(sent).toEqual({ hiddenEventIds: ["e1"], hiddenScheduleIds: ["s1"] });
  });
});
