import { EmailMessage } from '../mail/mailer';
import { escapeHtml } from '../mail/html';

/**
 * Modelo de e-mail de recuperação de senha (conteúdo/regra de negócio).
 *
 * Função pura: recebe os dados do domínio e devolve a mensagem pronta. Não
 * conhece o provedor de envio — apenas produz o {@link EmailMessage}.
 */
export function buildPasswordResetEmail(input: {
  to: string;
  name?: string | null;
  url: string;
  expiresInMinutes: number;
  /** Pedido feito por um administrador no painel, e não pelo próprio utilizador. */
  requestedByAdmin?: boolean;
}): EmailMessage {
  const greeting = input.name?.trim() ? `Olá, ${input.name.trim()}` : 'Olá';
  const subject = input.requestedByAdmin
    ? 'Redefinição de acesso — Church Manager'
    : 'Recuperação de senha — Church Manager';
  const intro = input.requestedByAdmin
    ? 'O administrador da sua igreja solicitou a redefinição de acesso à sua conta.'
    : 'Recebemos um pedido para redefinir a senha da sua conta.';
  const ignoreNote = input.requestedByAdmin
    ? 'Se não esperava este pedido, ignore este e-mail — a sua senha atual continua válida.'
    : 'Se você não solicitou a recuperação, ignore este e-mail — a sua senha atual continua válida.';
  const expiry = formatExpiry(input.expiresInMinutes);

  const greetingHtml = escapeHtml(greeting);
  const urlHtml = escapeHtml(input.url);

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #111827;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">Recuperação de senha</h1>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${greetingHtml},</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      ${escapeHtml(intro)} Clique no botão abaixo para escolher uma nova senha.
    </p>
    <p style="text-align: center; margin: 0 0 24px;">
      <a href="${urlHtml}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600;">
        Redefinir senha
      </a>
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 8px;">
      Este link expira em ${expiry} e só pode ser usado uma vez.
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 24px;">
      ${escapeHtml(ignoreNote)}
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0;">
      Caso o botão não funcione, copie e cole este endereço no navegador:<br />
      <a href="${urlHtml}" style="color: #4f46e5; word-break: break-all;">${urlHtml}</a>
    </p>
  </div>`.trim();

  const text = [
    `${greeting},`,
    '',
    intro,
    'Abra o link abaixo para escolher uma nova senha:',
    input.url,
    '',
    `Este link expira em ${expiry} e só pode ser usado uma vez.`,
    ignoreNote,
  ].join('\n');

  return { to: input.to, subject, html, text };
}

/** "60 minutos", "1 hora", "24 horas". */
export function formatExpiry(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}
