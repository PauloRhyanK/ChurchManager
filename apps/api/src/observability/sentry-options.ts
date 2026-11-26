import {
  httpIntegration,
  type Breadcrumb,
  type ErrorEvent,
  type NodeOptions,
} from '@sentry/nestjs';

/**
 * Envio de erros para o GlitchTip (compatível com o SDK do Sentry).
 *
 * Sem `SENTRY_DSN` não há SDK: testes e ambiente local não mandam nada.
 * Nada do pedido nem da pessoa sai daqui: corpo, cookies, cabeçalhos, query
 * string e usuário são removidos, e e-mail, telefone, CPF e tokens Bearer são
 * mascarados em qualquer texto do evento.
 */

type Env = Record<string, string | undefined>;

const DROPPED_INTEGRATIONS = new Set(['ProcessSession', 'Http', 'LocalVariablesAsync']);

const SENSITIVE_KEY =
  /^(password|senha|token|secret|segredo|authorization|cookie|e-?mail|phone|telefone|celular|whatsapp|cpf)$/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const CPF = /(?<![\w.-])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\w-])/g;
const PHONE =
  /(?<![\w-])(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s-]?\d{4}(?![\w-])/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function scrubText(text: string): string {
  return text
    .replace(BEARER, 'Bearer [token]')
    .replace(EMAIL, '[email]')
    .replace(CPF, '[cpf]')
    .replace(PHONE, '[telefone]');
}

function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[filtrado]' : scrubDeep(val, depth + 1);
  }
  return out;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request, user: _user, ...rest } = event;
  const out = scrubDeep(rest) as ErrorEvent;
  if (request) {
    out.request = {
      ...(request.method ? { method: request.method } : {}),
      ...(request.url ? { url: scrubText(stripQuery(request.url)) } : {}),
    };
  }
  return out;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const out = scrubDeep(breadcrumb) as Breadcrumb;
  if (typeof breadcrumb.data?.url === 'string') {
    out.data = { ...out.data, url: scrubText(stripQuery(breadcrumb.data.url)) };
  }
  return out;
}

export function buildSentryOptions(env: Env): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  const release = env.RELEASE_ID?.trim() || undefined;
  return {
    dsn,
    release,
    environment:
      env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV?.trim() || 'development',
    // SDK v11: `dataCollection` substitui o antigo `sendDefaultPii`, e o
    // padrão dele coleta quase tudo. Aqui tudo desligado, por extenso.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    includeLocalVariables: false,
    maxBreadcrumbs: 30,
    // Sem `tracesSampleRate`: tracing desligado (o GlitchTip é só para erros).
    // GlitchTip não usa sessões (release health): sai a ProcessSession e o
    // Http não conta pedidos como sessão. O corpo do pedido nunca vai.
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) => !DROPPED_INTEGRATIONS.has(integration.name),
      ),
      httpIntegration({ sessions: false, maxRequestBodySize: 'none' }),
    ],
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}
