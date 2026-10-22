import dns from 'node:dns';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { VALIDATION_PIPE_OPTIONS } from './validation-options';

// VPS/Docker sem IPv6 de saída: Node tentava AAAA primeiro → fetch failed para Vercel.
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Atrás de Cloudflare + nginx, `req.ip` seria o IP do proxy e o rate limit
  // contaria todos os visitantes juntos. TRUST_PROXY_HOPS = nº de proxies à frente.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }
  // CORS: `DynamicCorsMiddleware` — admin/auth via `ADMIN_CORS_ORIGIN`; rotas públicas por origens na BD.
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe(VALIDATION_PIPE_OPTIONS),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
void bootstrap();
