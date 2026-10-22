import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";
import { getApiErrorMessage, getApiFieldErrors } from "./api";

function httpError(status: number, data?: unknown) {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

describe("getApiErrorMessage", () => {
  it("sem resposta (rede) → mensagem em pt-BR", () => {
    const err = new AxiosError("Network Error", "ERR_NETWORK");
    expect(getApiErrorMessage(err)).toBe(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
    );
  });

  it("413 → arquivo grande demais", () => {
    expect(getApiErrorMessage(httpError(413))).toBe("Arquivo grande demais.");
  });

  it("401 com motivo do servidor (login) mostra o motivo, não 'sessão expirada'", () => {
    for (const message of [
      "Credenciais inválidas",
      "Acesso suspenso. Contate um administrador.",
      "Seu cadastro aguarda aprovação de um administrador.",
    ]) {
      const err = httpError(401, { statusCode: 401, message, error: "Unauthorized" });
      expect(getApiErrorMessage(err)).toBe(message);
    }
  });

  it("401 genérico (token expirado ou inválido) → sessão expirada", () => {
    const expired = "Sessão expirada. Entre novamente.";
    expect(getApiErrorMessage(httpError(401, { statusCode: 401, message: "Unauthorized" }))).toBe(expired);
    expect(getApiErrorMessage(httpError(401))).toBe(expired);
  });

  it("403 e 404", () => {
    expect(getApiErrorMessage(httpError(403))).toBe("Você não tem permissão para realizar esta ação.");
    expect(getApiErrorMessage(httpError(404))).toBe("Item não encontrado. Atualize a página e tente novamente.");
  });

  it("5xx → genérica, sem detalhes internos", () => {
    const msg = getApiErrorMessage(httpError(500, { message: "PrismaClientKnownRequestError at line 3" }));
    expect(msg).toBe("Erro interno do servidor. Tente novamente em instantes.");
  });

  it("400 de validação com frases em pt-BR do servidor usa rótulo do campo", () => {
    const msg = getApiErrorMessage(
      httpError(400, { message: ["mapsUrl deve ser uma URL http ou https válida"] }),
    );
    expect(msg).toBe("Link do Google Maps deve ser uma URL http ou https válida.");
  });

  it("400 de validação com mensagens em inglês do class-validator", () => {
    const msg = getApiErrorMessage(
      httpError(400, {
        message: [
          "name should not be empty",
          "email must be shorter than or equal to 160 characters",
          "foo must be a banana",
        ],
      }),
    );
    expect(msg).toContain("Nome é obrigatório.");
    expect(msg).toContain("E-mail deve ter no máximo 160 caracteres.");
    expect(msg).not.toMatch(/should|must|banana/);
  });

  it("400 com string simples em inglês não vaza", () => {
    expect(getApiErrorMessage(httpError(400, { message: "Bad Request" }))).toBe(
      "Dados inválidos. Revise os campos e tente novamente.",
    );
  });

  it("mantém mensagem de negócio em pt-BR (409/400 string)", () => {
    expect(getApiErrorMessage(httpError(409, { message: "Já existe uma sede cadastrada." }))).toBe(
      "Já existe uma sede cadastrada.",
    );
  });

  it("erro não-axios", () => {
    expect(getApiErrorMessage(new Error("boom"))).toBe("boom");
    expect(getApiErrorMessage(null)).toBe("Ocorreu um erro");
  });
});

describe("getApiFieldErrors", () => {
  it("mapeia mensagens para o campo", () => {
    const errs = getApiFieldErrors(
      httpError(400, { message: ["email must be an email", "youtubeUrl deve ser uma URL http ou https válida"] }),
    );
    expect(errs.email).toBe("E-mail inválido.");
    expect(errs.youtubeUrl).toBe("Canal do YouTube deve ser uma URL http ou https válida.");
  });

  it("vazio quando não é 400", () => {
    expect(getApiFieldErrors(httpError(500))).toEqual({});
  });
});
