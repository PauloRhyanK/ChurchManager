import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  allEditPermissions,
  isSuperRole,
  mergePermissionEntries,
  type PermissionMap,
} from '../access/permissions';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { tenant: true },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    this.assertLoginAllowed(user.status);

    const permissions = await this.resolvePermissions(user.id, user.role);

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        tenantSlug: user.tenant.slug,
        role: user.role,
        status: user.status,
        permissions,
      },
    };
  }

  private assertLoginAllowed(status: AdminUserStatus): void {
    switch (status) {
      case AdminUserStatus.ACTIVE:
        return;
      case AdminUserStatus.PENDING_APPROVAL:
        throw new UnauthorizedException(
          'Seu cadastro aguarda aprovação de um administrador.',
        );
      case AdminUserStatus.INVITED:
        throw new UnauthorizedException(
          'Convite ainda não concluído. Use o link recebido para definir sua senha.',
        );
      case AdminUserStatus.SUSPENDED:
        throw new UnauthorizedException('Acesso suspenso. Contate um administrador.');
      default:
        throw new UnauthorizedException('Credenciais inválidas');
    }
  }

  private async resolvePermissions(
    userId: string,
    role: AdminUserRole,
  ): Promise<PermissionMap> {
    if (isSuperRole(role)) {
      return allEditPermissions();
    }
    const memberships = await this.prisma.adminUserPermissionGroup.findMany({
      where: { userId },
      select: { group: { select: { entries: true } } },
    });
    return mergePermissionEntries(memberships.flatMap((m) => m.group.entries));
  }
}
