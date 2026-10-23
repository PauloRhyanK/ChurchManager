import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

export const PARTICIPANT_SECRET_HEADER = 'x-participant-secret';

/**
 * Comparação em tempo constante: os dois lados viram digests SHA-256 (sempre
 * do mesmo tamanho), então `timingSafeEqual` compara buffers iguais em tamanho
 * e um segredo de tamanho diferente dá `false` sem saída antecipada.
 */
function secretsMatch(received: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

/**
 * Rotas que expõem dados de participantes (nome, e-mail, telefone, mensagem):
 * só o servidor do site, com o segredo compartilhado no header
 * `x-participant-secret`, pode chamá-las.
 *
 * Sem `PUBLIC_PARTICIPANT_API_SECRET` configurado: 401 em produção; fora de
 * produção a rota fica aberta (ergonomia de dev, mesma regra da revalidação
 * do site).
 */
@Injectable()
export class ParticipantSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.PUBLIC_PARTICIPANT_API_SECRET?.trim();
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Acesso não autorizado');
      }
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const received = req.headers[PARTICIPANT_SECRET_HEADER];
    if (typeof received !== 'string' || !secretsMatch(received, expected)) {
      throw new UnauthorizedException('Acesso não autorizado');
    }
    return true;
  }
}
