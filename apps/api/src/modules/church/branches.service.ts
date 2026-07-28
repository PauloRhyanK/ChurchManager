import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { SiteRevalidationService } from '../site/site-revalidation.service';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteRevalidation: SiteRevalidationService,
  ) {}

  async listForTenant(tenantId: string) {
    return this.prisma.churchBranch.findMany({
      where: { tenantId },
      orderBy: [
        { isHeadquarters: 'desc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async getForTenant(tenantId: string, id: string) {
    const branch = await this.prisma.churchBranch.findFirst({
      where: { id, tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }
    return branch;
  }

  async createForTenant(tenantId: string, dto: CreateBranchDto) {
    const branch = await this.prisma.churchBranch.create({
      data: {
        ...dto,
        tenantId,
      },
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return branch;
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateBranchDto) {
    await this.getForTenant(tenantId, id);
    const updated = await this.prisma.churchBranch.update({
      where: { id },
      data: dto,
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return updated;
  }

  async removeForTenant(tenantId: string, id: string) {
    await this.getForTenant(tenantId, id);
    await this.prisma.churchBranch.delete({
      where: { id },
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return { success: true };
  }
}
