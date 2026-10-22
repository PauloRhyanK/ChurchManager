import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, put } = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post, put, delete: vi.fn() } }));

import {
  createBranch,
  createMinistry,
  createPastor,
  createSchedule,
  toBranchBody,
  toMinistryBody,
  toPastorBody,
  toScheduleBody,
  updateBranch,
  updateMinistry,
  updatePastor,
  updateSchedule,
  type BranchDto,
  type MinistryDto,
  type PastorDto,
  type ScheduleDto,
} from "./church-api";

const SERVER = {
  id: "id-1",
  tenantId: "tenant-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};
const FORBIDDEN = ["id", "tenantId", "createdAt", "updatedAt"];

// Linhas como vêm do GET (inclusive campos que o servidor devolve e recusa na escrita).
const branchRow = {
  ...SERVER,
  name: "Sede",
  location: "Centro",
  address: "Rua A",
  image: "https://cdn.exemplo.com/a.png",
  mapsUrl: "https://maps.exemplo.com/1",
  isHeadquarters: true,
  active: false,
  sortOrder: 3,
} as BranchDto;
const pastorRow = {
  ...SERVER,
  name: "Pr. João",
  image: null,
  active: false,
  sortOrder: 1,
} as PastorDto;
const ministryRow = {
  ...SERVER,
  name: "Louvor",
  description: "Música",
  icon: "music",
  image: null,
  active: false,
  sortOrder: 2,
} as MinistryDto;
const scheduleRow = {
  ...SERVER,
  title: "Culto",
  dayOfWeek: "Domingo",
  timeStart: "19:00",
  location: "Templo",
  description: null,
  active: false,
  sortOrder: 0,
} as ScheduleDto;

const CASES = [
  {
    nome: "filial",
    row: branchRow,
    toBody: toBranchBody,
    create: createBranch,
    update: updateBranch,
    base: "/admin/tenants/me/branches",
    editable: ["name", "location", "address", "image", "mapsUrl", "isHeadquarters", "active", "sortOrder"],
  },
  {
    nome: "pastor",
    row: pastorRow,
    toBody: toPastorBody,
    create: createPastor,
    update: updatePastor,
    base: "/admin/tenants/me/pastors",
    editable: ["name", "image", "active", "sortOrder"],
  },
  {
    nome: "ministério",
    row: ministryRow,
    toBody: toMinistryBody,
    create: createMinistry,
    update: updateMinistry,
    base: "/admin/tenants/me/ministries",
    editable: ["name", "description", "icon", "image", "active", "sortOrder"],
  },
  {
    nome: "horário",
    row: scheduleRow,
    toBody: toScheduleBody,
    create: createSchedule,
    update: updateSchedule,
    base: "/admin/tenants/me/schedules",
    editable: ["title", "dayOfWeek", "timeStart", "location", "description", "active", "sortOrder"],
  },
] as const;

describe.each(CASES)("corpo de escrita: $nome", (c) => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: {} });
    put.mockReset().mockResolvedValue({ data: {} });
  });

  it("a partir da linha do GET, só contém campos editáveis (false preservado)", () => {
    const body = (c.toBody as (r: unknown) => Record<string, unknown>)(c.row);
    for (const f of FORBIDDEN) expect(body).not.toHaveProperty(f);
    expect(Object.keys(body).sort()).toEqual([...c.editable].sort());
    expect(body.active).toBe(false);
  });

  it("create → POST na coleção com o corpo recebido", async () => {
    const body = (c.toBody as (r: unknown) => Record<string, unknown>)(c.row);
    await (c.create as (b: unknown) => Promise<unknown>)(body);
    expect(post).toHaveBeenCalledWith(c.base, body);
  });

  it("update → PUT com id só na URL e sem campos do servidor", async () => {
    const body = (c.toBody as (r: unknown) => Record<string, unknown>)(c.row);
    await (c.update as (id: string, b: unknown) => Promise<unknown>)("id-1", body);
    expect(put).toHaveBeenCalledWith(`${c.base}/id-1`, body);
    const sent = put.mock.calls[0][1] as Record<string, unknown>;
    for (const f of FORBIDDEN) expect(sent).not.toHaveProperty(f);
  });
});

describe("toBody: edição parcial e criação", () => {
  it("não inclui campos ausentes (não zera o que o usuário não tocou)", () => {
    expect(toBranchBody({ name: "Nova" })).toEqual({ name: "Nova" });
    expect(toPastorBody({ name: "X", active: undefined })).toEqual({ name: "X" });
  });

  it("horário novo: dayOfWeek e timeStart do formulário seguem no corpo", () => {
    expect(
      toScheduleBody({ title: "Culto", dayOfWeek: "Quarta", timeStart: "20:00" }),
    ).toEqual({ title: "Culto", dayOfWeek: "Quarta", timeStart: "20:00" });
  });
});
