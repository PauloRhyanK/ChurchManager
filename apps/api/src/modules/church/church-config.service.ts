import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateChurchConfigDto } from './dto/update-church-config.dto';
import { SiteRevalidationService } from '../site/site-revalidation.service';

@Injectable()
export class ChurchConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteRevalidation: SiteRevalidationService,
  ) {}

  async getForTenant(tenantId: string) {
    const config = await this.prisma.churchConfig.findUnique({
      where: { tenantId },
    });
    if (!config) {
      // Retorna objeto vazio de estrutura compatível
      return {
        tenantId,
        pixKey: null,
        bankName: null,
        bankCode: null,
        agency: null,
        account: null,
        holderName: null,
        holderDocument: null,
        youtubeUrl: null,
        instagramUrl: null,
        facebookUrl: null,
        phone: null,
        email: null,
        address: null,
      };
    }
    return config;
  }

  async updateForTenant(tenantId: string, dto: UpdateChurchConfigDto) {
    const config = await this.prisma.churchConfig.upsert({
      where: { tenantId },
      create: {
        ...dto,
        tenantId,
      },
      update: dto,
    });
    this.siteRevalidation.notifyContentChanged(tenantId);
    return config;
  }
}
