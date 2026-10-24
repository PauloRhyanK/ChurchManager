import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post: vi.fn(), put, delete: vi.fn() } }));

import { fetchSiteLayout, updateSiteLayout, type SiteHomeBlock } from "./tenant-site-content-api";

const ORDER: SiteHomeBlock[] = [
  "youtube",
  "mission",
  "schedules",
  "celulas",
  "events",
  "churches",
  "giving",
];

describe("layout do site", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("lê a ordem do endpoint de layout", async () => {
    get.mockResolvedValue({ data: { home: ORDER, updatedAt: null } });
    await expect(fetchSiteLayout()).resolves.toEqual({ home: ORDER, updatedAt: null });
    expect(get).toHaveBeenCalledWith("/admin/tenants/me/site-content/layout");
  });

  it("salva enviando só { home } com uma cópia da lista", async () => {
    put.mockResolvedValue({ data: { home: ORDER, updatedAt: "2026-10-24T12:00:00.000Z" } });
    await updateSiteLayout(ORDER);
    expect(put).toHaveBeenCalledTimes(1);
    const [url, body] = put.mock.calls[0];
    expect(url).toBe("/admin/tenants/me/site-content/layout");
    expect(body).toEqual({ home: ORDER });
    expect(Object.keys(body)).toEqual(["home"]);
    expect(body.home).not.toBe(ORDER);
  });
});
