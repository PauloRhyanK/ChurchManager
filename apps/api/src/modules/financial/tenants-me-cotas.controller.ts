import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CotasOverviewService } from './cotas-overview.service';
import { ListCotasQueryDto } from './dto/list-cotas-query.dto';

@Controller('admin/tenants/me')
@UseGuards(AuthGuard('jwt'))
export class TenantsMeCotasController {
  constructor(private readonly cotas: CotasOverviewService) {}

  @Get('cotas/:payerProfileId/payment-history')
  async payerPaymentHistory(
    @CurrentUser() user: AuthUser,
    @Param('payerProfileId', ParseUUIDPipe) payerProfileId: string,
  ) {
    return this.cotas.getPayerPaymentHistory(user.tenantId, payerProfileId);
  }

  @Get('cotas')
  async listCotas(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCotasQueryDto,
  ) {
    return this.cotas.listForTenant(
      user.tenantId,
      query.page ?? 1,
      query.limit ?? 10,
      query.status,
      query.q,
    );
  }
}
