import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import { toRegistrationDto } from './event-format.util';

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
        },
      });
      return toRegistrationDto(row);
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
