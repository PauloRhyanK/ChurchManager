import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AdminUserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  allEditPermissions,
  isSuperRole,
  mergePermissionEntries,
  type PermissionMap,
} from '../access/permissions';
import type { AuthUser } from './auth-user';

interface JwtPayload {
  sub: string;
  tenantId: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService) config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET não configurada');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });
    if (!user || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException();
    }
    if (user.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    let permissions: PermissionMap;
    if (isSuperRole(user.role)) {
      permissions = allEditPermissions();
    } else {
      const memberships = await this.prisma.adminUserPermissionGroup.findMany({
        where: { userId: user.id },
        select: { group: { select: { entries: true } } },
      });
      permissions = mergePermissionEntries(
        memberships.flatMap((m) => m.group.entries),
      );
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
      email: user.email,
      role: user.role,
      status: user.status,
      permissions,
    };
  }
}
