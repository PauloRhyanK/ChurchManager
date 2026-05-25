import { Injectable, NotFoundException } from '@nestjs/common';
import { FinancialLinkPreset } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLinkPresetDto } from './dto/create-link-preset.dto';
import { UpdateLinkPresetDto } from './dto/update-link-preset.dto';
import { toValueCents } from './payment-links-reuse.util';
import { normalizeSinglePaymentCharge } from './payment-link-charge-intent';
import { toPrismaFinancialLinkModule } from './payment-links-reuse.types';

@Injectable()
export class PaymentLinkPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: FinancialLinkPreset) {
    return {
      id: row.id,
      module: row.module === 'EVENTS' ? 'events' : 'cotas',
      presetKey: row.presetKey,
      name: row.name,
      sourceKey: row.sourceKey,
      isMonthly: row.isMonthly,
      subscriptionDurationMonths: row.subscriptionDurationMonths,
      value: row.valueCents != null ? row.valueCents / 100 : null,
      successUrl: row.successUrl,
      autoRedirect: row.autoRedirect,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.financialLinkPreset.findMany({
      where: { tenantId },
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async createForTenant(tenantId: string, dto: CreateLinkPresetDto) {
    const charge = normalizeSinglePaymentCharge({
      isMonthly: dto.isMonthly,
      subscriptionDurationMonths: dto.subscriptionDurationMonths,
    });
    const row = await this.prisma.financialLinkPreset.create({
      data: {
        tenantId,
        module: toPrismaFinancialLinkModule(dto.module),
        presetKey: dto.presetKey,
        name: dto.name,
        sourceKey: dto.sourceKey,
        isMonthly: charge.isMonthly,
        subscriptionDurationMonths: charge.isMonthly
          ? charge.subscriptionDurationMonths ?? null
          : null,
        valueCents: toValueCents(dto.value),
        successUrl: dto.successUrl?.trim() || null,
        autoRedirect: dto.successUrl?.trim() ? dto.autoRedirect : null,
        active: dto.active ?? true,
      },
    });
    return this.toDto(row);
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateLinkPresetDto) {
    const existing = await this.prisma.financialLinkPreset.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Preset de link não encontrado');
    }

    const nextSuccessUrl = dto.successUrl !== undefined ? dto.successUrl : existing.successUrl;
    const mergedCharge = normalizeSinglePaymentCharge({
      isMonthly: dto.isMonthly ?? existing.isMonthly,
      subscriptionDurationMonths:
        dto.subscriptionDurationMonths !== undefined
          ? dto.subscriptionDurationMonths
          : existing.subscriptionDurationMonths,
    });

    const row = await this.prisma.financialLinkPreset.update({
      where: { id },
      data: {
        ...(dto.module
          ? { module: toPrismaFinancialLinkModule(dto.module) }
          : {}),
        ...(dto.presetKey ? { presetKey: dto.presetKey } : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.sourceKey ? { sourceKey: dto.sourceKey } : {}),
        isMonthly: mergedCharge.isMonthly,
        subscriptionDurationMonths: mergedCharge.isMonthly
          ? mergedCharge.subscriptionDurationMonths ?? null
          : null,
        ...(dto.value !== undefined ? { valueCents: toValueCents(dto.value) } : {}),
        ...(dto.successUrl !== undefined
          ? { successUrl: dto.successUrl?.trim() || null }
          : {}),
        ...(dto.autoRedirect !== undefined
          ? { autoRedirect: nextSuccessUrl ? dto.autoRedirect : null }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.toDto(row);
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.financialLinkPreset.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Preset de link não encontrado');
    }
    await this.prisma.financialLinkPreset.delete({ where: { id } });
    return { ok: true };
  }
}
