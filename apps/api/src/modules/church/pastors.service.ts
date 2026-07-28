import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePastorDto } from './dto/create-pastor.dto';
import { UpdatePastorDto } from './dto/update-pastor.dto';
import { SiteRevalidationService } from '../site/site-revalidation.service';

@Injectable()
export class PastorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteRevalidation: SiteRevalidationService,
  ) {}

  async listForTenant(tenantId: string) {
    return this.prisma.pastor.findMany({
      where: { tenantId },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async getForTenant(tenantId: string, id: string) {
    const pastor = await this.prisma.pastor.findFirst({
      where: { id, tenantId },
    });
    if (!pastor) {
      throw new NotFoundException('Pastor não encontrado');
    }
    return pastor;
  }

  async createForTenant(tenantId: string, dto: CreatePastorDto) {
    const pastor = await this.prisma.pastor.create({
      data: {
        ...dto,
        tenantId,
      },
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return pastor;
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdatePastorDto) {
    await this.getForTenant(tenantId, id);
    const updated = await this.prisma.pastor.update({
      where: { id },
      data: dto,
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return updated;
  }

  async removeForTenant(tenantId: string, id: string) {
    await this.getForTenant(tenantId, id);
    await this.prisma.pastor.delete({
      where: { id },
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return { success: true };
  }
}
