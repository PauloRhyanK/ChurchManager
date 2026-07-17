import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../auth/auth-user';
import { isSuperRole, levelSatisfies } from './permissions';
import {
  REQUIRE_PERMISSION_KEY,
  type RequiredPermission,
} from './require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Não autenticado.');
    }
    if (isSuperRole(user.role)) {
      return true;
    }
    const granted = user.permissions?.[required.module];
    if (!levelSatisfies(granted, required.level)) {
      throw new ForbiddenException(
        'Você não tem permissão para esta operação.',
      );
    }
    return true;
  }
}
