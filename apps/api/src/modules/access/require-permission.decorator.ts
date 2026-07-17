import { SetMetadata } from '@nestjs/common';
import { PermissionLevel, PermissionModule } from '@prisma/client';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export interface RequiredPermission {
  module: PermissionModule;
  level: PermissionLevel;
}

/**
 * Exige uma permissão (módulo + nível) para aceder ao handler/controller.
 * Deve ser usado com `PermissionsGuard` após `AuthGuard('jwt')`.
 */
export const RequirePermission = (
  module: PermissionModule,
  level: PermissionLevel,
) => SetMetadata<string, RequiredPermission>(REQUIRE_PERMISSION_KEY, { module, level });
