import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PublicSignupDto } from './dto/public-onboarding.dto';
import { SignupLinksService } from './signup-links.service';

@Controller('public/signup')
export class PublicSignupController {
  constructor(private readonly links: SignupLinksService) {}

  @Get(':token')
  async info(@Param('token') token: string) {
    return this.links.getPublicByToken(token);
  }

  @Post(':token')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Param('token') token: string,
    @Body() dto: PublicSignupDto,
  ) {
    return this.links.register(token, dto);
  }
}
