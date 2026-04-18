import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AdminUserRole } from '@prisma/client';
import type { AuthUser } from './auth-user';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (req.user?.role !== AdminUserRole.PLATFORM_ADMIN) {
      throw new ForbiddenException('Acesso reservado à equipa da plataforma.');
    }
    return true;
  }
}
