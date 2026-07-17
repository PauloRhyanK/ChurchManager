import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { AcceptInvitationDto } from './dto/public-onboarding.dto';
import { InvitationsService } from './invitations.service';

@Controller('public/invitations')
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(':token')
  async info(@Param('token') token: string) {
    return this.invitations.getByToken(token);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.invitations.accept(token, dto);
  }
}
