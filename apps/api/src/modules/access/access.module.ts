import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionGroupsService } from './permission-groups.service';
import { TenantUsersService } from './tenant-users.service';
import { InvitationsService } from './invitations.service';
import { SignupLinksService } from './signup-links.service';
import { TenantsMePermissionGroupsController } from './tenants-me-permission-groups.controller';
import { TenantsMeUsersController } from './tenants-me-users.controller';
import { TenantsMeSignupLinksController } from './tenants-me-signup-links.controller';
import { PublicSignupController } from './public-signup.controller';
import { PublicInvitationsController } from './public-invitations.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    TenantsMePermissionGroupsController,
    TenantsMeUsersController,
    TenantsMeSignupLinksController,
    PublicSignupController,
    PublicInvitationsController,
  ],
  providers: [
    PermissionsService,
    PermissionsGuard,
    PermissionGroupsService,
    TenantUsersService,
    InvitationsService,
    SignupLinksService,
  ],
  exports: [PermissionsService, PermissionsGuard],
})
export class AccessModule {}
