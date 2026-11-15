import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Tenant } from '@prisma/client';
import { createHash, createHmac } from 'node:crypto';
import { normalizeCpf } from '../../common/cpf';
import { maskEmail } from '../../common/mask-email';
import { PrismaService } from '../../prisma/prisma.service';
import { generateAccessToken } from '../access/access-token.util';
import { Mailer } from '../mail/mailer';
import { successUrlAllowedByPublicOrigins } from '../tenants/public-web-origin.util';
import { planLabelFromRawPayloadRef } from './asaas-payment-meta.patch';
import { buildContributorAccessEmail } from './contributor-access.email';
import { toPrismaLinkMode } from './payment-links-reuse.types';

/** `aud` do JWT de contribuidor — nunca aceito pelos guards do painel. */
export const CONTRIBUTOR_AUDIENCE = 'contributor';
export const CONTRIBUTOR_TOKEN_TTL_MINUTES = 30;
export const CONTRIBUTOR_SESSION_TTL_DAYS = 30;
export const CONTRIBUTOR_PAYMENTS_LIMIT = 12;

interface ContributorJwtPayload {
  tenantId: string;
  cpf: string;
}

export function hashContributorToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Segredo próprio do JWT de contribuidor: `CONTRIBUTOR_JWT_SECRET` ou, sem ela,
 * derivado de `JWT_SECRET` (HMAC). Assim um JWT do painel nunca valida aqui e
 * vice-versa, mesmo antes da checagem de `aud`.
 */
export function resolveContributorJwtSecret(config: {
  contributorSecret?: string | null;
  jwtSecret?: string | null;
}): string {
  const own = config.contributorSecret?.trim();
  if (own) return own;
  const base = config.jwtSecret?.trim();
  if (!base) {
    throw new Error('JWT_SECRET não configurada');
  }
  return createHmac('sha256', base).update('contributor-session-v1').digest('hex');
}

function invalidToken(): UnauthorizedException {
  return new UnauthorizedException({ code: 'INVALID_TOKEN' });
}

/**
 * "Minhas contribuições" sem login: link mágico por e-mail → sessão JWT de 30 dias
 * (só leitura) → resumo de assinaturas, pagamentos e link pendente do CPF.
 */
@Injectable()
export class ContributorAccessService {
  private readonly logger = new Logger(ContributorAccessService.name);
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = resolveContributorJwtSecret({
      contributorSecret: config.get<string>('CONTRIBUTOR_JWT_SECRET'),
      jwtSecret: config.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Envia o link mágico se houver perfil (tenant + CPF) com e-mail. Responde sempre
   * igual para não revelar se o CPF existe. `returnUrl` precisa estar nas origens
   * públicas do tenant (senão 400).
   */
  async requestAccessLink(
    tenant: Tenant,
    input: { cpf: string; returnUrl: string },
    allowedOrigins: readonly string[],
  ): Promise<{ sent: true }> {
    const returnUrl = input.returnUrl.trim();
    if (!successUrlAllowedByPublicOrigins(returnUrl, allowedOrigins)) {
      throw new BadRequestException(
        'returnUrl deve usar HTTPS (ou http em localhost) e o domínio deve estar nas origens públicas registadas para esta igreja.',
      );
    }
    const cpf = normalizeCpf(input.cpf);
    const profile = await this.prisma.financialPayerProfile.findUnique({
      where: { tenantId_cpf: { tenantId: tenant.id, cpf } },
      select: { name: true, email: true },
    });
    const email = profile?.email?.trim();
    if (!profile || !email) {
      return { sent: true };
    }

    const token = generateAccessToken();
    await this.prisma.financialContributorAccessToken.create({
      data: {
        tenantId: tenant.id,
        cpf,
        tokenHash: hashContributorToken(token),
        expiresAt: new Date(
          Date.now() + CONTRIBUTOR_TOKEN_TTL_MINUTES * 60 * 1000,
        ),
      },
    });

    const url = new URL(returnUrl);
    url.searchParams.set('token', token);
    try {
      await this.mailer.send(
        buildContributorAccessEmail({
          to: email,
          name: profile.name,
          churchName: tenant.name,
          url: url.toString(),
          expiresInMinutes: CONTRIBUTOR_TOKEN_TTL_MINUTES,
        }),
      );
    } catch (error) {
      // Não propaga: a resposta não pode revelar se o CPF existe.
      this.logger.error(
        `Falha ao enviar link de contribuições (tenant ${tenant.slug}): ${error}`,
      );
    }
    return { sent: true };
  }

  /** Troca o token do e-mail (uso único, 30 min) por uma sessão JWT de 30 dias. */
  async createSession(
    tenant: Tenant,
    rawToken: string,
  ): Promise<{ sessionToken: string; expiresAt: string }> {
    const token = rawToken?.trim() ?? '';
    if (!token) {
      throw invalidToken();
    }
    const row = await this.prisma.financialContributorAccessToken.findUnique({
      where: { tokenHash: hashContributorToken(token) },
    });
    const now = new Date();
    if (
      !row ||
      row.tenantId !== tenant.id ||
      row.usedAt ||
      row.expiresAt.getTime() <= now.getTime()
    ) {
      throw invalidToken();
    }
    // Marca como usado só se ainda não foi (corrida entre duas trocas simultâneas).
    const claimed = await this.prisma.financialContributorAccessToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      throw invalidToken();
    }

    const expiresAt = new Date(
      now.getTime() + CONTRIBUTOR_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const payload: ContributorJwtPayload = { tenantId: tenant.id, cpf: row.cpf };
    const sessionToken = await this.jwt.signAsync(payload, {
      secret: this.secret,
      audience: CONTRIBUTOR_AUDIENCE,
      expiresIn: `${CONTRIBUTOR_SESSION_TTL_DAYS}d`,
    });
    return { sessionToken, expiresAt: expiresAt.toISOString() };
  }

  /** Valida o JWT de contribuidor (`aud` + tenant do slug) e devolve o CPF. */
  async verifySession(
    tenant: Tenant,
    authorization: string | undefined,
  ): Promise<string> {
    const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
    if (!match) {
      throw new UnauthorizedException();
    }
    let payload: ContributorJwtPayload & { aud?: unknown };
    try {
      payload = await this.jwt.verifyAsync(match[1]!.trim(), {
        secret: this.secret,
        audience: CONTRIBUTOR_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (
      payload.aud !== CONTRIBUTOR_AUDIENCE ||
      payload.tenantId !== tenant.id ||
      typeof payload.cpf !== 'string' ||
      !/^\d{11}$/.test(payload.cpf)
    ) {
      throw new UnauthorizedException();
    }
    return payload.cpf;
  }

  async getMe(tenant: Tenant, authorization: string | undefined) {
    const cpf = await this.verifySession(tenant, authorization);
    const profile = await this.prisma.financialPayerProfile.findUnique({
      where: { tenantId_cpf: { tenantId: tenant.id, cpf } },
      select: { id: true, name: true, email: true },
    });
    if (!profile) {
      throw new UnauthorizedException();
    }

    const subs = await this.prisma.financialSubscription.findMany({
      where: { tenantId: tenant.id, payerProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        currentPeriodEnd: true,
        plan: { select: { name: true, amountCents: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { amountCents: true, rawPayloadRef: true },
        },
      },
    });

    const txs = await this.prisma.financialTransaction.findMany({
      where: { tenantId: tenant.id, payerProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: CONTRIBUTOR_PAYMENTS_LIMIT,
      select: {
        createdAt: true,
        amountCents: true,
        status: true,
        billingType: true,
      },
    });

    return {
      payer: { name: profile.name, emailHint: maskEmail(profile.email) },
      subscriptions: subs.map((s) => {
        const last = s.transactions[0];
        const valueCents = last?.amountCents ?? s.plan.amountCents;
        const label =
          (last && planLabelFromRawPayloadRef(last.rawPayloadRef, last.amountCents)) ||
          s.plan.name;
        return {
          id: s.id,
          status: s.status,
          valueCents,
          label,
          createdAt: s.createdAt.toISOString(),
          currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        };
      }),
      payments: txs.map((t) => ({
        date: t.createdAt.toISOString(),
        valueCents: t.amountCents,
        status: t.status,
        billingType: t.billingType ?? null,
      })),
      pendingLink: await this.findPendingLink(tenant.id, cpf, profile.id),
    };
  }

  /**
   * Link `CPF_CUSTOM` ativo mais recente do CPF, desde que nenhuma transação
   * confirmada do perfil tenha sido criada depois dele.
   */
  private async findPendingLink(
    tenantId: string,
    cpf: string,
    payerProfileId: string,
  ) {
    const link = await this.prisma.financialPaymentLink.findFirst({
      where: {
        tenantId,
        cpf,
        mode: toPrismaLinkMode('cpf_custom'),
        active: true,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        url: true,
        valueCents: true,
        isMonthly: true,
        subscriptionDurationMonths: true,
        createdAt: true,
      },
    });
    if (!link) {
      return null;
    }
    const paidAfter = await this.prisma.financialTransaction.findFirst({
      where: {
        tenantId,
        payerProfileId,
        status: 'CONFIRMED',
        createdAt: { gt: link.createdAt },
      },
      select: { id: true },
    });
    if (paidAfter) {
      return null;
    }
    return {
      url: link.url,
      valueCents: link.valueCents,
      isMonthly: link.isMonthly,
      subscriptionDurationMonths: link.subscriptionDurationMonths,
      createdAt: link.createdAt.toISOString(),
    };
  }
}
