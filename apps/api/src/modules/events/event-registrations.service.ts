import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import { toRegistrationDto } from './event-format.util';
import { collectFieldValues } from './event-field-validation.util';

@Injectable()
export class EventRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAllForTenant(tenantId: string) {
    const rows = await this.prisma.eventRegistration.findMany({
      where: { tenantId },
      include: {
        event: { select: { title: true, date: true, tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) =>
      toRegistrationDto(row, row.event),
    );
  }

  async listForEvent(tenantId: string, eventId: string) {
    await this.assertEventBelongsToTenant(tenantId, eventId);
    const rows = await this.prisma.eventRegistration.findMany({
      where: { tenantId, eventId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toRegistrationDto(row));
  }

  async createForEvent(
    tenantId: string,
    eventId: string,
    dto: CreateEventRegistrationDto,
  ) {
    await this.assertEventBelongsToTenant(tenantId, eventId);

    const email = dto.email.trim().toLowerCase();

    // Ingresso opcional: valida login obrigatório, campos e link de comunidade.
    let communityLink: string | null = null;
    let fieldValuesToPersist: Array<{ fieldId: string; value: string }> = [];
    if (dto.ticketTypeId) {
      const ticket = await this.prisma.eventTicketType.findFirst({
        where: { id: dto.ticketTypeId, tenantId, eventId },
        include: { fieldConfigs: { include: { field: true } } },
      });
      if (!ticket) {
        throw new NotFoundException('Tipo de ingresso não encontrado');
      }
      if (!ticket.allowGuestRegistration && !dto.userId) {
        throw new BadRequestException(
          'É necessário iniciar sessão para se inscrever neste ingresso',
        );
      }
      communityLink = ticket.communityLink;
      fieldValuesToPersist = collectFieldValues(
        ticket.fieldConfigs.map((fc) => ({
          fieldId: fc.fieldId,
          key: fc.field.key,
          label: fc.field.label,
          enabled: fc.enabled,
          required: fc.required,
        })),
        dto.fieldValues,
      );
    }

    try {
      const row = await this.prisma.eventRegistration.create({
        data: {
          tenantId,
          eventId,
          name: dto.name.trim(),
          email,
          phone: dto.phone ?? null,
          message: dto.message ?? null,
          userId: dto.userId ?? null,
          ...(fieldValuesToPersist.length > 0
            ? {
                fieldValues: {
                  create: fieldValuesToPersist.map((fv) => ({
                    fieldId: fv.fieldId,
                    value: fv.value,
                  })),
                },
              }
            : {}),
        },
      });
      return { ...toRegistrationDto(row), communityLink };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Você já está inscrito neste evento');
      }
      throw err;
    }
  }

  async findExistingRegistration(
    tenantId: string,
    eventId: string,
    email: string,
    userId?: string | null,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.eventRegistration.findFirst({
      where: {
        tenantId,
        eventId,
        OR: [
          { email: normalizedEmail },
          ...(userId ? [{ userId }] : []),
        ],
      },
    });
  }

  async listForParticipant(
    tenantId: string,
    email: string,
    userId?: string | null,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        tenantId,
        OR: [
          { email: normalizedEmail },
          ...(userId ? [{ userId }] : []),
        ],
      },
      include: {
        event: { select: { title: true, date: true, tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toRegistrationDto(row, row.event));
  }

  private async assertEventBelongsToTenant(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
  }
}
