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

  it("salva só os campos do contrato, sem extras", async () => {
    put.mockResolvedValue({ data: { items: [], days: 7, updatedAt: null } });
    const body = { hiddenEventIds: ["e1"], hiddenScheduleIds: ["s1"], topics: [], extra: 1 } as never;
    await updateProjectionSettings(body);
    const [url, sent] = put.mock.calls[0];
    expect(url).toBe("/admin/tenants/me/projection/settings");
    expect(sent).toEqual({ hiddenEventIds: ["e1"], hiddenScheduleIds: ["s1"], topics: [] });
  });

  it("tópicos vão campo a campo, sem chaves locais", async () => {
    put.mockResolvedValue({ data: { items: [], topics: [], days: 7, updatedAt: null } });
    await updateProjectionSettings({
      hiddenEventIds: [],
      hiddenScheduleIds: [],
      topics: [
        { key: "tmp-1", title: "Células", text: "Encontre uma", callToAction: null, active: true } as never,
        { id: "t1", title: "Batismo", text: "Inscreva-se", callToAction: "Fale conosco", active: false },
      ],
    });
    expect(put.mock.calls[0][1].topics).toEqual([
      { title: "Células", text: "Encontre uma", callToAction: null, active: true },
      { id: "t1", title: "Batismo", text: "Inscreva-se", callToAction: "Fale conosco", active: false },
    ]);
  });
});
