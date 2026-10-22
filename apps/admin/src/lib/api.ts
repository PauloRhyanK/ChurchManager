import axios, { type AxiosError } from "axios";
import { clearStoredSession, getStoredToken } from "./auth-storage";

const rawApiUrl = import.meta.env.API_URL || import.meta.env.VITE_API_URL;
const baseURL = rawApiUrl?.replace(/\/$/, "") || "http://localhost:3000/api";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearStoredSession();
      if (!window.location.pathname.startsWith("/login")) {
        const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const qs = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
        window.location.assign(`/login${qs}`);
      }
    }
    return Promise.reject(err);
  },
);

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  location: "Cidade / Estado",
  address: "Endereço",
  image: "Imagem",
  mapsUrl: "Link do Google Maps",
  title: "Título",
  dayOfWeek: "Dia da semana",
  timeStart: "Horário de início",
  description: "Descrição",
  icon: "Ícone",
  sortOrder: "Ordem",
  phone: "Telefone",
  email: "E-mail",
  pixKey: "Chave PIX",
  bankName: "Nome do banco",
  bankCode: "Código do banco",
  agency: "Agência",
  account: "Conta corrente",
  holderName: "Nome do favorecido",
  holderDocument: "CNPJ do favorecido",
  youtubeUrl: "Canal do YouTube",
  instagramUrl: "Perfil do Instagram",
  facebookUrl: "Página do Facebook",
};

const GENERIC_VALIDATION = "Dados inválidos. Revise os campos e tente novamente.";

/** Traduz uma mensagem do class-validator; devolve o campo e a frase em pt-BR. */
function translateValidation(raw: string): { field?: string; text: string } {
  const m = /^(\w+)\s+(.*)$/.exec(raw.trim());
  const field = m && FIELD_LABELS[m[1]] ? m[1] : undefined;
  if (!m || !field) {
    // Frase já em pt-BR sem campo conhecido: mantém; inglês/desconhecido: genérica.
    return { text: /[áàâãéêíóôõúç]| deve | não /i.test(raw) ? raw : GENERIC_VALIDATION };
  }
  const label = FIELD_LABELS[field];
  const rest = m[2];
  const max = /shorter than or equal to (\d+) characters/.exec(rest);
  if (max) return { field, text: `${label} deve ter no máximo ${max[1]} caracteres.` };
  if (/should not be empty|must be a string/.test(rest)) {
    return { field, text: `${label} é obrigatório.` };
  }
  if (/must be an email/.test(rest)) return { field, text: `${label} inválido.` };
  if (/must be a URL|must be a valid url|must be an URL/i.test(rest)) {
    return { field, text: `${label} deve ser uma URL válida.` };
  }
  if (/^deve /.test(rest)) {
    return { field, text: `${label} ${rest}${rest.endsWith(".") ? "" : "."}` };
  }
  if (/^[^a-z]*[a-z]*[áàâãéêíóôõúç]/i.test(rest) && !/\b(must|should)\b/.test(rest)) {
    return { field, text: `${label}: ${rest}${rest.endsWith(".") ? "" : "."}` };
  }
  return { field, text: `${label} é inválido.` };
}

function validationMessages(err: AxiosError): string[] {
  const data = err.response?.data as { message?: string | string[] } | undefined;
  if (!data?.message) return [];
  return Array.isArray(data.message) ? data.message : [data.message];
}

/** Erros de validação (400) por campo, quando o servidor informa a propriedade. */
export function getApiFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!axios.isAxiosError(err) || err.response?.status !== 400) return out;
  for (const raw of validationMessages(err)) {
    const { field, text } = translateValidation(raw);
    if (field && !out[field]) out[field] = text;
  }
  return out;
}

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (!err.response) {
      return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
    }
    if (status === 400) {
      const texts = [...new Set(validationMessages(err).map((m) => translateValidation(m).text))];
      return texts.length ? texts.join(" ") : GENERIC_VALIDATION;
    }
    if (status === 401) {
      // Login traz o motivo em pt-BR (credenciais, suspenso…); token expirado vem só "Unauthorized".
      const reason = validationMessages(err)[0];
      return reason && reason !== "Unauthorized" ? reason : "Sessão expirada. Entre novamente.";
    }
    if (status === 403) return "Você não tem permissão para realizar esta ação.";
    if (status === 404) return "Item não encontrado. Atualize a página e tente novamente.";
    if (status === 413) return "Arquivo grande demais.";
    if (status && status >= 500) return "Erro interno do servidor. Tente novamente em instantes.";
    const msg = validationMessages(err)[0];
    return msg && translateValidation(msg).text === msg ? msg : GENERIC_VALIDATION;
  }
  if (err instanceof Error) return err.message;
  return "Ocorreu um erro";
}
