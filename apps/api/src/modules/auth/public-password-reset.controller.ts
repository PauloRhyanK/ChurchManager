import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/password-reset.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('public/password-reset')
export class PublicPasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ public: { limit: 5, ttl: 60_000 } })
  async request(@Body() dto: RequestPasswordResetDto) {
    return this.passwordReset.requestReset(dto.email);
  }

  @Get(':token')
  async info(@Param('token') token: string) {
    return this.passwordReset.getByToken(token);
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ public: { limit: 10, ttl: 60_000 } })
  async reset(
    @Param('token') token: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.passwordReset.reset(token, dto.password);
  }
}
