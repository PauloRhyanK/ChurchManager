import { EmailMessage } from '../mail/mailer';
import { escapeHtml } from '../mail/html';
import { formatExpiry } from '../auth/password-reset.email';

/**
 * E-mail do link mágico de "Minhas contribuições" (site público, sem login).
 * Função pura: só monta a mensagem.
 */
export function buildContributorAccessEmail(input: {
  to: string;
  name?: string | null;
  churchName: string;
  url: string;
  expiresInMinutes: number;
}): EmailMessage {
  const firstName = input.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Olá, ${firstName}` : 'Olá';
  const subject = `Acesse suas contribuições — ${input.churchName}`;
  const expiry = formatExpiry(input.expiresInMinutes);
  const urlHtml = escapeHtml(input.url);
  const churchHtml = escapeHtml(input.churchName);

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #111827;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">Minhas contribuições</h1>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(greeting)},</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      Recebemos um pedido para ver as suas contribuições na ${churchHtml}. Clique no botão abaixo para acessar.
    </p>
    <p style="text-align: center; margin: 0 0 24px;">
      <a href="${urlHtml}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600;">
        Ver minhas contribuições
      </a>
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 8px;">
      Este link expira em ${expiry} e só pode ser usado uma vez.
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 24px;">
      Se você não fez este pedido, ignore este e-mail.
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0;">
      Caso o botão não funcione, copie e cole este endereço no navegador:<br />
      <a href="${urlHtml}" style="color: #4f46e5; word-break: break-all;">${urlHtml}</a>
    </p>
  </div>`.trim();

  const text = [
    `${greeting},`,
    '',
    `Recebemos um pedido para ver as suas contribuições na ${input.churchName}.`,
    'Abra o link abaixo para acessar:',
    input.url,
    '',
    `Este link expira em ${expiry} e só pode ser usado uma vez.`,
    'Se você não fez este pedido, ignore este e-mail.',
  ].join('\n');

  return { to: input.to, subject, html, text };
}
