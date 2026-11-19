import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { redactSecrets } from './redact.util';

/** Rotas cujo corpo é texto privado do usuário (as palavras do pregador): o corpo não vai para o log. */
const PRIVATE_BODY_PATHS = ['/admin/tenants/me/sermons'];

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      body?: unknown;
    }>();
    const started = Date.now();
    const privateBody = PRIVATE_BODY_PATHS.some((path) => (req.originalUrl ?? '').includes(path));
    // eslint-disable-next-line no-console
    console.log(
      '[HTTP] request',
      privateBody
        ? { method: req.method, url: req.originalUrl }
        : { method: req.method, url: req.originalUrl, body: redactSecrets(req.body) },
    );

    return next.handle().pipe(
      tap({
        next: () => {
          // eslint-disable-next-line no-console
          console.log('[HTTP] response', {
            method: req.method,
            url: req.originalUrl,
            elapsedMs: Date.now() - started,
          });
        },
      }),
    );
  }
}

