import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class UpdateProjectionSettingsDto {
  @IsArray({ message: 'hiddenEventIds deve ser uma lista' })
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true, message: 'hiddenEventIds deve conter ids válidos' })
  hiddenEventIds!: string[];

  @IsArray({ message: 'hiddenScheduleIds deve ser uma lista' })
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true, message: 'hiddenScheduleIds deve conter ids válidos' })
  hiddenScheduleIds!: string[];
}
