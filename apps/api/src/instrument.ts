// Precisa ser o PRIMEIRO import do main.ts: o SDK instrumenta os módulos
// (http, express, Nest) quando eles são carregados.
import * as Sentry from '@sentry/nestjs';
import { buildSentryOptions } from './observability/sentry-options';

const options = buildSentryOptions(process.env);
if (options) {
  Sentry.init(options);
}
