/**
 * Porta de envio de e-mail (abstração de infraestrutura).
 *
 * As regras de negócio dependem apenas desta abstração, nunca de um provedor
 * concreto (Resend, SMTP, SendGrid…). Para trocar a tecnologia de envio basta
 * fornecer outra implementação desta classe no MailModule.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export abstract class Mailer {
  abstract send(message: EmailMessage): Promise<void>;
}
