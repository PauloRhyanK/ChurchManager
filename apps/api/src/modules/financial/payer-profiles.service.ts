import { Injectable } from '@nestjs/common';
import { FinancialPayerProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCpf } from '../../common/cpf';
import { CreatePayerProfileDto } from './dto/create-payer-profile.dto';

@Injectable()
export class PayerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertForTenant(
    tenantId: string,
    dto: CreatePayerProfileDto,
  ): Promise<FinancialPayerProfile> {
    const cpf = normalizeCpf(dto.cpf);

    return this.prisma.financialPayerProfile.upsert({
      where: {
        tenantId_cpf: { tenantId, cpf },
      },
      create: {
        tenantId,
        cpf,
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.replace(/\D/g, '') ?? null,
      },
      update: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.replace(/\D/g, '') ?? null,
      },
    });
  }
}
