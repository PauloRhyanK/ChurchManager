/**
 * Porta de envio de e-mail (abstração de infraestrutura).
 *
 * As regras de negócio dependem apenas desta abstração, nunca de um provedor
 * concreto (Resend, SMTP, SendGrid…). Para trocar a tecnologia de envio basta
 * fornecer outra implementação desta classe no MailModule.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  /**
   * Quando definido, o anexo é embutido no corpo e pode ser referenciado no
   * HTML por `cid:<contentId>` — evita o bloqueio de imagens remotas que a
   * maioria dos clientes aplica por omissão.
   */
  contentId?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export abstract class Mailer {
  abstract send(message: EmailMessage): Promise<void>;
}
