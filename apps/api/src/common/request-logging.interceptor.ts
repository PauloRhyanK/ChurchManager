import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { redactSecrets } from './redact.util';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      body?: unknown;
    }>();
    const started = Date.now();
    // eslint-disable-next-line no-console
    console.log('[HTTP] request', {
      method: req.method,
      url: req.originalUrl,
      body: redactSecrets(req.body),
    });

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

