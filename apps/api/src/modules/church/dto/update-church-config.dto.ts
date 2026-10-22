import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsHttpUrl } from './field-decorators';

export class UpdateChurchConfigDto {
  // Ofertório
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  pixKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  bankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  bankCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  agency?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  account?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  holderName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  holderDocument?: string | null;

  // Redes Sociais
  @IsOptional()
  @IsString()
  @IsHttpUrl()
  @MaxLength(512)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  youtubeUrl?: string | null;

  @IsOptional()
  @IsString()
  @IsHttpUrl()
  @MaxLength(512)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  instagramUrl?: string | null;

  @IsOptional()
  @IsString()
  @IsHttpUrl()
  @MaxLength(512)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  facebookUrl?: string | null;

  // Contato geral
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  email?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  address?: string | null;
}
