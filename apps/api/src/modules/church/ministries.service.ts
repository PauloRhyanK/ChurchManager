import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';
import { SiteRevalidationService } from '../site/site-revalidation.service';

@Injectable()
export class MinistriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteRevalidation: SiteRevalidationService,
  ) {}

  async listForTenant(tenantId: string) {
    return this.prisma.ministry.findMany({
      where: { tenantId },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async getForTenant(tenantId: string, id: string) {
    const ministry = await this.prisma.ministry.findFirst({
      where: { id, tenantId },
    });
    if (!ministry) {
      throw new NotFoundException('Ministério não encontrado');
    }
    return ministry;
  }

  async createForTenant(tenantId: string, dto: CreateMinistryDto) {
    const ministry = await this.prisma.ministry.create({
      data: {
        ...dto,
        tenantId,
      },
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return ministry;
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateMinistryDto) {
    await this.getForTenant(tenantId, id);
    const updated = await this.prisma.ministry.update({
      where: { id },
      data: dto,
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return updated;
  }

  async removeForTenant(tenantId: string, id: string) {
    await this.getForTenant(tenantId, id);
    await this.prisma.ministry.delete({
      where: { id },
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return { success: true };
  }
}
