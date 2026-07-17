import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { generateAccessToken } from './access-token.util';
import {
  CreateSignupLinkDto,
  UpdateSignupLinkDto,
} from './dto/signup-link.dto';
import { PublicSignupDto } from './dto/public-onboarding.dto';
import { buildOnboardingUrl, resolveAdminWebBaseUrl } from './onboarding-url';
import { PermissionGroupsService } from './permission-groups.service';

@Injectable()
export class SignupLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly groups: PermissionGroupsService,
  ) {}

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.tenantSignupLink.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async createForTenant(
    tenantId: string,
    createdById: string,
    dto: CreateSignupLinkDto,
  ) {
    const defaultGroupIds = await this.groups.assertGroupsBelongToTenant(
      tenantId,
      dto.defaultGroupIds ?? [],
    );
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    const row = await this.prisma.tenantSignupLink.create({
      data: {
        tenantId,
        token: generateAccessToken(),
        label: dto.label ?? null,
        defaultGroupIds,
        expiresAt,
        maxUses: dto.maxUses ?? null,
        createdById,
      },
    });
    return this.toDto(row);
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    dto: UpdateSignupLinkDto,
  ) {
    const existing = await this.prisma.tenantSignupLink.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Link de cadastro não encontrado');
    }
    const defaultGroupIds =
      dto.defaultGroupIds === undefined
        ? undefined
        : await this.groups.assertGroupsBelongToTenant(
            tenantId,
            dto.defaultGroupIds,
          );
    const row = await this.prisma.tenantSignupLink.update({
      where: { id },
      data: {
        label: dto.label === undefined ? undefined : dto.label,
        isActive: dto.isActive === undefined ? undefined : dto.isActive,
        defaultGroupIds:
          defaultGroupIds === undefined ? undefined : defaultGroupIds,
      },
    });
    return this.toDto(row);
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.tenantSignupLink.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Link de cadastro não encontrado');
    }
    await this.prisma.tenantSignupLink.delete({ where: { id } });
    return { ok: true };
  }

  async getPublicByToken(token: string) {
    const link = await this.findUsableLink(token);
    return {
      churchName: link.tenant.name,
      tenantSlug: link.tenant.slug,
    };
  }

  async register(token: string, dto: PublicSignupDto) {
    const link = await this.findUsableLink(token);
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Já existe um utilizador com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const defaultGroupIds = this.parseGroupIds(link.defaultGroupIds);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.adminUser.create({
        data: {
          tenantId: link.tenantId,
          email,
          name: dto.name,
          role: AdminUserRole.TENANT_MEMBER,
          status: AdminUserStatus.PENDING_APPROVAL,
          passwordHash,
        },
      });
      if (defaultGroupIds.length > 0) {
        const valid = await tx.permissionGroup.findMany({
          where: { tenantId: link.tenantId, id: { in: defaultGroupIds } },
          select: { id: true },
        });
        if (valid.length > 0) {
          await tx.adminUserPermissionGroup.createMany({
            data: valid.map((g) => ({ userId: user.id, groupId: g.id })),
            skipDuplicates: true,
          });
        }
      }
      await tx.tenantSignupLink.update({
        where: { id: link.id },
        data: { useCount: { increment: 1 } },
      });
    });

    return { ok: true };
  }

  private async findUsableLink(token: string) {
    const link = await this.prisma.tenantSignupLink.findUnique({
      where: { token },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    if (!link || !link.isActive) {
      throw new NotFoundException('Link de cadastro inválido.');
    }
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Este link de cadastro expirou.');
    }
    if (link.maxUses != null && link.useCount >= link.maxUses) {
      throw new GoneException('Este link de cadastro atingiu o limite de usos.');
    }
    return link;
  }

  private parseGroupIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }

  private toDto(row: {
    id: string;
    token: string;
    label: string | null;
    defaultGroupIds: unknown;
    expiresAt: Date | null;
    maxUses: number | null;
    useCount: number;
    isActive: boolean;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      token: row.token,
      url: buildOnboardingUrl(
        resolveAdminWebBaseUrl({
          adminWebBaseUrl: this.config.get<string>('ADMIN_WEB_BASE_URL'),
          adminCorsOrigin: this.config.get<string>('ADMIN_CORS_ORIGIN'),
        }),
        `/cadastro/${row.token}`,
      ),
      label: row.label,
      defaultGroupIds: this.parseGroupIds(row.defaultGroupIds),
      expiresAt: row.expiresAt,
      maxUses: row.maxUses,
      useCount: row.useCount,
      isActive: row.isActive,
      createdAt: row.createdAt,
    };
  }
}
