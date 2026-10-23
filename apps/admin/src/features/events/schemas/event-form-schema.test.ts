import { describe, expect, it } from "vitest";
import {
  buildEventFormSchema,
  eventBasicSchema,
  eventFormToApiBody,
  type EventFormValues,
} from "./event-form-schema";

const PAST_DATE = "2020-01-05";
const FUTURE_DATE = "2999-12-31";

function values(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: "Conferência",
    shortDescription: "",
    description: "",
    detailsHtml: "",
    date: FUTURE_DATE,
    timeStart: "",
    timeEnd: "",
    format: "IN_PERSON",
    location: "",
    onlineUrl: "",
    coverImageUrl: "",
    videoUrl: "",
    tags: [],
    published: false,
    ...overrides,
  };
}

function issuesAt(result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }, field: string) {
  return (result.error?.issues ?? [])
    .filter((issue) => issue.path[0] === field)
    .map((issue) => issue.message);
}

describe("buildEventFormSchema", () => {
  it("na criação bloqueia data passada", () => {
    const result = buildEventFormSchema({ allowPastDate: false }).safeParse(
      values({ date: PAST_DATE }),
    );
    expect(result.success).toBe(false);
    expect(issuesAt(result, "date")).toContain("A data deve ser hoje ou posterior");
  });

  it("na edição permite data passada (para corrigir ou despublicar)", () => {
    const result = buildEventFormSchema({ allowPastDate: true }).safeParse(
      values({ date: PAST_DATE, published: false }),
    );
    expect(result.success).toBe(true);
  });

  it("mesmo com data passada permitida, o fim tem de ser depois do início", () => {
    const result = buildEventFormSchema({ allowPastDate: true }).safeParse(
      values({ date: PAST_DATE, timeStart: "20:00", timeEnd: "19:00" }),
    );
    expect(issuesAt(result, "timeEnd")).toContain(
      "O horário de fim deve ser posterior ao de início",
    );
  });

  it("formato ONLINE sem link de transmissão é erro", () => {
    const result = buildEventFormSchema({ allowPastDate: true }).safeParse(
      values({ format: "ONLINE", onlineUrl: "" }),
    );
    expect(result.success).toBe(false);
    expect(issuesAt(result, "onlineUrl")).toContain("Informe o link de transmissão");
  });

  it("formato ONLINE com link é válido", () => {
    const result = buildEventFormSchema({ allowPastDate: false }).safeParse(
      values({ format: "ONLINE", onlineUrl: "https://youtube.com/live/abc" }),
    );
    expect(result.success).toBe(true);
  });
});

describe("eventBasicSchema (wizard de criação)", () => {
  it("continua a exigir data de hoje em diante", () => {
    const result = eventBasicSchema.safeParse({
      title: "Retiro",
      date: PAST_DATE,
      format: "IN_PERSON",
      tags: [],
    });
    expect(issuesAt(result, "date")).toContain("A data deve ser hoje ou posterior");
  });
});

describe("eventFormToApiBody", () => {
  it("horário vazio vira null para limpar o horário guardado", () => {
    const body = eventFormToApiBody(values({ timeStart: "", timeEnd: "  " }));
    expect(body.timeStart).toBeNull();
    expect(body.timeEnd).toBeNull();
  });

  it("mantém o horário preenchido", () => {
    const body = eventFormToApiBody(values({ timeStart: "19:30", timeEnd: "21:00" }));
    expect(body.timeStart).toBe("19:30");
    expect(body.timeEnd).toBe("21:00");
  });
});
