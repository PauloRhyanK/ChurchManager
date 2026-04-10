/** Utilizador injectado no request após JwtStrategy.validate */
export interface AuthUser {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
}
