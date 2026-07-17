import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { generateAccessToken } from './access-token.util';
import { AcceptInvitationDto } from './dto/public-onboarding.dto';
import { buildOnboardingUrl, resolveAdminWebBaseUrl } from './onboarding-url';
import { PermissionGroupsService } from './permission-groups.service';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly groups: PermissionGroupsService,
  ) {}

  async createInvite(
    tenantId: string,
    invitedById: string,
    data: { email: string; name?: string | null; groupIds?: string[] },
  ) {
    const email = data.email.trim().toLowerCase();
    const groupIds = await this.groups.assertGroupsBelongToTenant(
      tenantId,
      data.groupIds ?? [],
    );

    const existingUser = await this.prisma.adminUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('Já existe um utilizador com este e-mail.');
    }

    const days = this.expiryDays();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const token = generateAccessToken();

    const invitation = await this.prisma.$transaction(async (tx) => {
      const user = await tx.adminUser.create({
        data: {
          tenantId,
          email,
          name: data.name ?? null,
          role: AdminUserRole.TENANT_MEMBER,
          status: AdminUserStatus.INVITED,
          passwordHash: null,
        },
      });
      return tx.adminUserInvitation.create({
        data: {
          tenantId,
          email,
          token,
          userId: user.id,
          groupIds,
          expiresAt,
          invitedById,
        },
      });
    });

    return {
      id: invitation.id,
      email: invitation.email,
      token: invitation.token,
      url: this.buildInviteUrl(invitation.token),
      expiresAt: invitation.expiresAt,
    };
  }

  async getByToken(token: string) {
    const invitation = await this.prisma.adminUserInvitation.findUnique({
      where: { token },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    if (!invitation) {
      throw new NotFoundException('Convite não encontrado.');
    }
    if (invitation.completedAt) {
      throw new GoneException('Este convite já foi utilizado.');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Este convite expirou.');
    }
    return {
      email: invitation.email,
      churchName: invitation.tenant.name,
      tenantSlug: invitation.tenant.slug,
    };
  }

  async accept(token: string, dto: AcceptInvitationDto) {
    const invitation = await this.prisma.adminUserInvitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      throw new NotFoundException('Convite não encontrado.');
    }
    if (invitation.completedAt) {
      throw new GoneException('Este convite já foi utilizado.');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Este convite expirou.');
    }
    if (!invitation.userId) {
      throw new BadRequestException('Convite inválido.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const groupIds = this.parseGroupIds(invitation.groupIds);
    const userId = invitation.userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: userId },
        data: {
          passwordHash,
          status: AdminUserStatus.ACTIVE,
          approvedAt: new Date(),
          name: dto.name ?? undefined,
        },
      });
      if (groupIds.length > 0) {
        await tx.adminUserPermissionGroup.createMany({
          data: groupIds.map((groupId) => ({ userId, groupId })),
          skipDuplicates: true,
        });
      }
      await tx.adminUserInvitation.update({
        where: { id: invitation.id },
        data: { completedAt: new Date() },
      });
    });

    return { ok: true };
  }

  private parseGroupIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }

  private expiryDays(): number {
    const raw = Number(
      this.config.get<string>('INVITATION_DEFAULT_EXPIRY_DAYS'),
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 7;
  }

  private buildInviteUrl(token: string): string {
    const base = resolveAdminWebBaseUrl({
      adminWebBaseUrl: this.config.get<string>('ADMIN_WEB_BASE_URL'),
      adminCorsOrigin: this.config.get<string>('ADMIN_CORS_ORIGIN'),
    });
    return buildOnboardingUrl(base, `/convite/${token}`);
  }
}
