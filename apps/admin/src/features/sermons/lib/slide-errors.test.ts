import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { slideErrorMessage, THROTTLED_MESSAGE } from "./slide-errors";

const FALLBACK = "Não foi possível gerar os slides.";
const apiError = (status: number, data: unknown) =>
  new AxiosError("Request failed with status code " + status, "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: { headers: {} } as never,
  });

describe("slideErrorMessage", () => {
  it("409, 422, 502 e 503: a mensagem da API", () => {
    for (const [status, message] of [
      [409, "A palavra mudou enquanto os slides eram gerados. Gere de novo."],
      [422, "O modelo não pôde resumir esta palavra. Use “Versículos e pontos”."],
      [502, "A resposta do modelo veio incompleta. Tente de novo."],
      [503, "O modelo configurado não aceitou o pedido. Avise o administrador."],
    ] as const) {
      expect(slideErrorMessage(apiError(status, { message, statusCode: status }), FALLBACK)).toBe(message);
    }
  });

  it("409/503 sem mensagem: o texto padrão", () => {
    expect(slideErrorMessage(apiError(503, {}), FALLBACK)).toBe(FALLBACK);
    expect(slideErrorMessage(apiError(409, { message: "  " }), FALLBACK)).toBe(FALLBACK);
  });

  it("429: a mensagem da API, menos a do ThrottlerException (em inglês)", () => {
    const ours = "Você gerou slides completos muitas vezes na última hora. Tente de novo mais tarde.";
    expect(slideErrorMessage(apiError(429, { message: ours }), FALLBACK)).toBe(ours);
    expect(slideErrorMessage(apiError(429, { message: "ThrottlerException: Too Many Requests" }), FALLBACK)).toBe(THROTTLED_MESSAGE);
    expect(slideErrorMessage(apiError(429, {}), FALLBACK)).toBe(THROTTLED_MESSAGE);
    expect(THROTTLED_MESSAGE).toBe("Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.");
  });

  it("outros status seguem o tratamento geral do painel", () => {
    expect(slideErrorMessage(apiError(400, { message: ["Modelo indisponível."] }), FALLBACK)).toBe("Modelo indisponível.");
    expect(slideErrorMessage(apiError(404, { message: "Not Found" }), FALLBACK)).toBe("Item não encontrado. Atualize a página e tente novamente.");
    expect(slideErrorMessage(apiError(500, { message: "Internal server error" }), FALLBACK)).toBe("Erro interno do servidor. Tente novamente em instantes.");
  });

  it("erro fora do HTTP: o texto padrão, nunca a mensagem crua", () => {
    expect(slideErrorMessage(new Error("Network Error"), FALLBACK)).toBe(FALLBACK);
    expect(slideErrorMessage("x", FALLBACK)).toBe(FALLBACK);
  });
});
