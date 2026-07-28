import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { SiteModule } from '../site/site.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { PastorsController } from './pastors.controller';
import { PastorsService } from './pastors.service';
import { MinistriesController } from './ministries.controller';
import { MinistriesService } from './ministries.service';
import { ChurchConfigController } from './church-config.controller';
import { ChurchConfigService } from './church-config.service';

@Module({
  imports: [AuthModule, AccessModule, SiteModule],
  controllers: [
    BranchesController,
    PastorsController,
    MinistriesController,
    ChurchConfigController,
  ],
  providers: [
    BranchesService,
    PastorsService,
    MinistriesService,
    ChurchConfigService,
  ],
  exports: [
    BranchesService,
    PastorsService,
    MinistriesService,
    ChurchConfigService,
  ],
})
export class ChurchModule {}
