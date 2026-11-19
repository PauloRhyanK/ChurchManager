import axios from "axios";
import { getApiErrorMessage } from "@/lib/api";

/** Status em que a API dos slides devolve uma mensagem própria, em português, que deve chegar à pessoa. */
const OWN_MESSAGE_STATUSES = [409, 422, 502, 503];

export const THROTTLED_MESSAGE = "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.";

function serverMessage(data: unknown): string | null {
  const message = (data as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

/**
 * Mensagem do erro ao gerar ou atualizar slides. Nos status da tabela vale a mensagem da API; no 429, a da API,
 * menos a do limitador geral do Nest (em inglês); no resto, o tratamento geral do painel; fora do HTTP, `fallback`.
 */
export function slideErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const status = error.response?.status;
  const message = serverMessage(error.response?.data);
  if (status !== undefined && OWN_MESSAGE_STATUSES.includes(status)) return message ?? fallback;
  if (status === 429) return message && !message.startsWith("ThrottlerException") ? message : THROTTLED_MESSAGE;
  return getApiErrorMessage(error);
}
