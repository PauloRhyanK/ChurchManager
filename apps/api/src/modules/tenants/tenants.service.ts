import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminUserRole, Prisma, type Tenant } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertTenantSlugValid,
  normalizeTenantSlug,
} from './tenant-slug.util';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAllTenantsSummary(): Promise<
    Pick<Tenant, 'id' | 'name' | 'slug' | 'createdAt'>[]
  > {
    return this.prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTenantWithInitialAdmin(dto: {
    name: string;
    slug: string;
    adminEmail: string;
    adminPassword: string;
  }): Promise<{
    tenant: Tenant;
    admin: { id: string; email: string };
  }> {
    let slug: string;
    try {
      slug = normalizeTenantSlug(dto.slug);
      assertTenantSlugValid(slug);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Slug inválido',
      );
    }

    const name = dto.name.trim();
    if (name.length < 2 || name.length > 255) {
      throw new BadRequestException('Nome da igreja inválido.');
    }

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name, slug },
        });
        const admin = await tx.adminUser.create({
          data: {
            tenantId: tenant.id,
            email: adminEmail,
            passwordHash,
            role: AdminUserRole.TENANT_ADMIN,
          },
        });
        return {
          tenant,
          admin: { id: admin.id, email: admin.email },
        };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = (e.meta as { target?: string[] } | undefined)?.target;
        const t = Array.isArray(target) ? target.join(' ') : '';
        if (t.includes('slug')) {
          throw new ConflictException('Já existe uma igreja com este slug.');
        }
        if (t.includes('email')) {
          throw new ConflictException(
            'Este e-mail de administrador já está registado.',
          );
        }
        throw new ConflictException('Dados em conflito com registos existentes.');
      }
      throw e;
    }
  }

  async findByIdOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Igreja não encontrada');
    }
    return tenant;
  }

  async findBySlugOrThrow(slug: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException('Igreja não encontrada');
    }
    return tenant;
  }
}
