import {
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { generateAccessToken } from '../access/access-token.util';
import {
  buildOnboardingUrl,
  resolveAdminWebBaseUrl,
} from '../access/onboarding-url';
import { Mailer } from '../mail/mailer';
import { buildPasswordResetEmail } from './password-reset.email';

const TOKEN_TTL_MINUTES = 60;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: Mailer,
  ) {}

  /**
   * Inicia a recuperação de senha. Responde sempre de forma genérica para não
   * revelar se o e-mail existe na base.
   */
  async requestReset(email: string): Promise<{ ok: true }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalized },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        passwordHash: true,
      },
    });

    const eligible =
      user && user.passwordHash && user.status === AdminUserStatus.ACTIVE;

    if (eligible) {
      const token = generateAccessToken();
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

      await this.prisma.$transaction(async (tx) => {
        // Invalida pedidos anteriores ainda pendentes deste usuário.
        await tx.adminPasswordReset.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.adminPasswordReset.create({
          data: {
            userId: user.id,
            email: user.email,
            token,
            expiresAt,
          },
        });
      });

      try {
        await this.mailer.send(
          buildPasswordResetEmail({
            to: user.email,
            name: user.name,
            url: this.buildResetUrl(token),
            expiresInMinutes: TOKEN_TTL_MINUTES,
          }),
        );
      } catch (error) {
        // Não propagamos o erro para não vazar a existência da conta.
        this.logger.error(
          `Falha ao enviar e-mail de recuperação para ${user.email}: ${error}`,
        );
      }
    }

    return { ok: true };
  }

  /** Valida um token de recuperação e devolve o e-mail associado. */
  async getByToken(token: string): Promise<{ email: string }> {
    const reset = await this.findValidReset(token);
    return { email: reset.email };
  }

  /** Redefine a senha do usuário associado ao token. */
  async reset(token: string, password: string): Promise<{ ok: true }> {
    const reset = await this.findValidReset(token);
    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.adminPasswordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      });
      // Invalida quaisquer outros tokens pendentes do mesmo usuário.
      await tx.adminPasswordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    return { ok: true };
  }

  private async findValidReset(token: string) {
    const reset = await this.prisma.adminPasswordReset.findUnique({
      where: { token },
    });
    if (!reset) {
      throw new NotFoundException('Pedido de recuperação não encontrado.');
    }
    if (reset.usedAt) {
      throw new GoneException('Este link já foi utilizado.');
    }
    if (reset.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Este link expirou.');
    }
    return reset;
  }

  private buildResetUrl(token: string): string {
    const base = resolveAdminWebBaseUrl({
      adminWebBaseUrl: this.config.get<string>('ADMIN_WEB_BASE_URL'),
      adminCorsOrigin: this.config.get<string>('ADMIN_CORS_ORIGIN'),
    });
    return buildOnboardingUrl(base, `/recuperar-senha/${token}`);
  }
}
