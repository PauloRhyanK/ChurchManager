import { EmailMessage } from '../mail/mailer';
import { escapeHtml } from '../mail/html';

/**
 * Modelo de e-mail de convite de utilizador (conteúdo/regra de negócio).
 *
 * Função pura: recebe os dados do domínio e devolve a mensagem pronta. Não
 * conhece o provedor de envio — apenas produz o {@link EmailMessage}.
 */
export function buildInvitationEmail(input: {
  to: string;
  name?: string | null;
  churchName: string;
  url: string;
  expiresInDays: number;
}): EmailMessage {
  const greeting = input.name?.trim() ? `Olá, ${input.name.trim()}` : 'Olá';
  const subject = `Convite para ${input.churchName} — Church Manager`;

  const greetingHtml = escapeHtml(greeting);
  const churchNameHtml = escapeHtml(input.churchName);
  const urlHtml = escapeHtml(input.url);

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #111827;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">Você foi convidado</h1>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${greetingHtml},</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      Você foi convidado para aceder ao painel de <strong>${churchNameHtml}</strong>
      no Church Manager. Clique no botão abaixo para definir a sua senha e ativar a conta.
    </p>
    <p style="text-align: center; margin: 0 0 24px;">
      <a href="${urlHtml}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600;">
        Aceitar convite
      </a>
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 8px;">
      Este convite expira em ${input.expiresInDays} dias.
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 24px;">
      Se você não esperava este convite, pode ignorar este e-mail com segurança.
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0;">
      Caso o botão não funcione, copie e cole este endereço no navegador:<br />
      <a href="${urlHtml}" style="color: #4f46e5; word-break: break-all;">${urlHtml}</a>
    </p>
  </div>`.trim();

  const text = [
    `${greeting},`,
    '',
    `Você foi convidado para aceder ao painel de ${input.churchName} no Church Manager.`,
    'Abra o link abaixo para definir a sua senha e ativar a conta:',
    input.url,
    '',
    `Este convite expira em ${input.expiresInDays} dias.`,
    'Se você não esperava este convite, ignore este e-mail.',
  ].join('\n');

  return { to: input.to, subject, html, text };
}
