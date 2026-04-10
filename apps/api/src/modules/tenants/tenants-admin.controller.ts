import { Body, Controller, Param, Put } from '@nestjs/common';
import { UpdateAsaasCredentialsDto } from './dto/update-asaas-credentials.dto';
import { TenantCredentialsService } from './tenant-credentials.service';

@Controller('admin/tenants')
export class TenantsAdminController {
  constructor(private readonly credentials: TenantCredentialsService) {}

  @Put(':id/asaas-credentials')
  async updateAsaasCredentials(
    @Param('id') tenantId: string,
    @Body() dto: UpdateAsaasCredentialsDto,
  ) {
    await this.credentials.updateAsaasCredentials(tenantId, dto);
    return { ok: true };
  }
}

