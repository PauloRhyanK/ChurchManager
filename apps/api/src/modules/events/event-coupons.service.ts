import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponDiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventCouponDto } from './dto/create-event-coupon.dto';
import { UpdateEventCouponDto } from './dto/update-event-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { isValidCpfDigits, normalizeCpf } from '../../common/cpf';

export interface ValidatedCouponResult {
  valid: boolean;
  couponId: string;
  code: string;
  name: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  discountCents: number;
  eligibleTicketTypeIds: string[] | null;
}

@Injectable()
export class EventCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForEvent(tenantId: string, eventId: string) {
    const items = await this.prisma.eventCoupon.findMany({
      where: { tenantId, eventId },
      include: {
        ticketTypes: {
          select: { ticketTypeId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((c) => ({
      ...c,
      ticketTypeIds: c.ticketTypes.map((t) => t.ticketTypeId),
    }));
  }

  async createForEvent(
    tenantId: string,
    eventId: string,
    dto: CreateEventCouponDto,
  ) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.eventCoupon.findUnique({
      where: {
        tenantId_eventId_code: { tenantId, eventId, code },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe um cupom com este código neste evento',
      );
    }

    if (
      dto.discountType === 'PERCENTAGE' &&
      (dto.discountValue < 1 || dto.discountValue > 100)
    ) {
      throw new BadRequestException(
        'Desconto percentual deve ser entre 1% e 100%',
      );
    }
    if (dto.discountType === 'FIXED' && dto.discountValue < 1) {
      throw new BadRequestException('Desconto fixo deve ser maior que zero');
    }

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validFrom && validUntil && validFrom > validUntil) {
      throw new BadRequestException(
        'Data de início não pode ser posterior à data de término',
      );
    }

    if (dto.ticketTypeIds && dto.ticketTypeIds.length > 0) {
      const types = await this.prisma.eventTicketType.findMany({
        where: {
          tenantId,
          eventId,
          id: { in: dto.ticketTypeIds },
        },
      });
      if (types.length !== dto.ticketTypeIds.length) {
        throw new BadRequestException(
          'Um ou mais ingressos selecionados são inválidos',
        );
      }
    }

    const created = await this.prisma.eventCoupon.create({
      data: {
        tenantId,
        eventId,
        code,
        name: dto.name ?? null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxUses: dto.maxUses ?? null,
        maxUsesPerCpf: dto.maxUsesPerCpf ?? 1,
        validFrom,
        validUntil,
        active: dto.active ?? true,
        ticketTypes: dto.ticketTypeIds?.length
          ? {
              create: dto.ticketTypeIds.map((ticketTypeId) => ({
                ticketTypeId,
              })),
            }
          : undefined,
      },
      include: {
        ticketTypes: { select: { ticketTypeId: true } },
      },
    });

    return {
      ...created,
      ticketTypeIds: created.ticketTypes.map((t) => t.ticketTypeId),
    };
  }

  async updateForEvent(
    tenantId: string,
    eventId: string,
    couponId: string,
    dto: UpdateEventCouponDto,
  ) {
    const coupon = await this.prisma.eventCoupon.findFirst({
      where: { id: couponId, tenantId, eventId },
      include: { ticketTypes: true },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    let code = coupon.code;
    if (dto.code && dto.code.trim().toUpperCase() !== coupon.code) {
      code = dto.code.trim().toUpperCase();
      const collision = await this.prisma.eventCoupon.findUnique({
        where: {
          tenantId_eventId_code: { tenantId, eventId, code },
        },
      });
      if (collision) {
        throw new ConflictException(
          'Já existe um cupom com este código neste evento',
        );
      }
    }

    const discountType = dto.discountType ?? coupon.discountType;
    const discountValue = dto.discountValue ?? coupon.discountValue;
    if (
      discountType === 'PERCENTAGE' &&
      (discountValue < 1 || discountValue > 100)
    ) {
      throw new BadRequestException(
        'Desconto percentual deve ser entre 1% e 100%',
      );
    }
    if (discountType === 'FIXED' && discountValue < 1) {
      throw new BadRequestException('Desconto fixo deve ser maior que zero');
    }

    const validFrom =
      dto.validFrom !== undefined
        ? dto.validFrom
          ? new Date(dto.validFrom)
          : null
        : coupon.validFrom;
    const validUntil =
      dto.validUntil !== undefined
        ? dto.validUntil
          ? new Date(dto.validUntil)
          : null
        : coupon.validUntil;
    if (validFrom && validUntil && validFrom > validUntil) {
      throw new BadRequestException(
        'Data de início não pode ser posterior à data de término',
      );
    }

    if (dto.ticketTypeIds !== undefined && dto.ticketTypeIds.length > 0) {
      const types = await this.prisma.eventTicketType.findMany({
        where: {
          tenantId,
          eventId,
          id: { in: dto.ticketTypeIds },
        },
      });
      if (types.length !== dto.ticketTypeIds.length) {
        throw new BadRequestException(
          'Um ou mais ingressos selecionados são inválidos',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.ticketTypeIds !== undefined) {
        await tx.eventCouponTicketType.deleteMany({
          where: { couponId: coupon.id },
        });
        if (dto.ticketTypeIds.length > 0) {
          await tx.eventCouponTicketType.createMany({
            data: dto.ticketTypeIds.map((ticketTypeId) => ({
              couponId: coupon.id,
              ticketTypeId,
            })),
          });
        }
      }

      return tx.eventCoupon.update({
        where: { id: coupon.id },
        data: {
          code,
          name: dto.name !== undefined ? dto.name : coupon.name,
          discountType,
          discountValue,
          maxUses: dto.maxUses !== undefined ? dto.maxUses : coupon.maxUses,
          maxUsesPerCpf:
            dto.maxUsesPerCpf !== undefined
              ? dto.maxUsesPerCpf
              : coupon.maxUsesPerCpf,
          validFrom,
          validUntil,
          active: dto.active !== undefined ? dto.active : coupon.active,
        },
        include: {
          ticketTypes: { select: { ticketTypeId: true } },
        },
      });
    });

    return {
      ...updated,
      ticketTypeIds: updated.ticketTypes.map((t) => t.ticketTypeId),
    };
  }

  async deleteForEvent(tenantId: string, eventId: string, couponId: string) {
    const coupon = await this.prisma.eventCoupon.findFirst({
      where: { id: couponId, tenantId, eventId },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    await this.prisma.eventCoupon.delete({
      where: { id: coupon.id },
    });

    return { success: true };
  }

  async validateCoupon(
    tenantId: string,
    eventId: string,
    dto: ValidateCouponDto,
  ): Promise<ValidatedCouponResult> {
    const code = dto.code.trim().toUpperCase();
    const coupon = await this.prisma.eventCoupon.findUnique({
      where: {
        tenantId_eventId_code: { tenantId, eventId, code },
      },
      include: {
        ticketTypes: { select: { ticketTypeId: true } },
      },
    });

    if (!coupon || !coupon.active) {
      throw new BadRequestException('Cupom inválido ou inativo');
    }

    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      throw new BadRequestException('Este cupom ainda não é válido');
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      throw new BadRequestException('Este cupom expirou');
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException(
        'Este cupom atingiu o limite de utilizações',
      );
    }

    if (dto.cpf) {
      let rawCpf = dto.cpf;
      try {
        const cpf11 = normalizeCpf(rawCpf);
        if (isValidCpfDigits(cpf11)) {
          const usedCountForCpf = await this.prisma.eventOrder.count({
            where: {
              tenantId,
              eventId,
              couponId: coupon.id,
              payer: { cpf: cpf11 },
              status: { notIn: ['CANCELLED', 'FAILED', 'EXPIRED'] },
            },
          });
          if (usedCountForCpf >= coupon.maxUsesPerCpf) {
            throw new BadRequestException(
              'Limite de utilizações deste cupom atingido para este CPF',
            );
          }
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        // Se CPF fornecido for malformado na validação prévia de cupom, não quebramos
      }
    }

    if (!dto.lines?.length) {
      throw new BadRequestException('Informe ao menos um ingresso');
    }

    const restrictedTicketIds = coupon.ticketTypes.map((t) => t.ticketTypeId);
    const hasRestrictions = restrictedTicketIds.length > 0;

    const lineTypeIds = dto.lines.map((l) => l.ticketTypeId);
    const ticketTypes = await this.prisma.eventTicketType.findMany({
      where: {
        tenantId,
        eventId,
        id: { in: lineTypeIds },
      },
    });
    const typeMap = new Map(ticketTypes.map((t) => [t.id, t]));

    let eligibleAmount = 0;
    for (const line of dto.lines) {
      if (hasRestrictions && !restrictedTicketIds.includes(line.ticketTypeId)) {
        continue;
      }
      const type = typeMap.get(line.ticketTypeId);
      if (type) {
        eligibleAmount += (type.priceCents + type.feeCents) * line.quantity;
      }
    }

    if (eligibleAmount <= 0) {
      throw new BadRequestException(
        hasRestrictions
          ? 'Este cupom não é válido para os ingressos selecionados'
          : 'Ingressos selecionados não possuem valor elegível para desconto',
      );
    }

    let discountCents = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discountCents = Math.round((eligibleAmount * coupon.discountValue) / 100);
    } else {
      discountCents = Math.min(coupon.discountValue, eligibleAmount);
    }

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountCents,
      eligibleTicketTypeIds: hasRestrictions ? restrictedTicketIds : null,
    };
  }
}
