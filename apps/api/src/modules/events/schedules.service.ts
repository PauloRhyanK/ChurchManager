import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { parseTimeOnly, toScheduleDto } from './event-format.util';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string, activeOnly = false) {
    const rows = await this.prisma.schedule.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { dayOfWeek: 'asc' }],
    });
    return rows.map((row) => toScheduleDto(row));
  }

  async createForTenant(tenantId: string, dto: CreateScheduleDto) {
    const row = await this.prisma.schedule.create({
      data: {
        tenantId,
        title: dto.title,
        dayOfWeek: dto.dayOfWeek,
        timeStart: parseTimeOnly(dto.timeStart)!,
        location: dto.location ?? null,
        description: dto.description ?? null,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return toScheduleDto(row);
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateScheduleDto) {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Programação não encontrada');
    }

    const row = await this.prisma.schedule.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.dayOfWeek !== undefined ? { dayOfWeek: dto.dayOfWeek } : {}),
        ...(dto.timeStart !== undefined
          ? { timeStart: parseTimeOnly(dto.timeStart)! }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return toScheduleDto(row);
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Programação não encontrada');
    }
    await this.prisma.schedule.delete({ where: { id } });
    return { ok: true };
  }
}
