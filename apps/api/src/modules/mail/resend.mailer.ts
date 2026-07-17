import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailMessage, Mailer } from './mailer';

/**
 * Adapter concreto que envia e-mails via Resend.
 *
 * Toda a dependência do SDK `resend` fica confinada aqui. Nenhuma regra de
 * negócio importa este ficheiro — só a porta {@link Mailer}.
 */
@Injectable()
export class ResendMailer extends Mailer {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly client: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY não configurada. O envio de e-mails irá falhar.',
      );
    }
    this.client = new Resend(apiKey ?? 'missing-api-key');
    this.from =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      'Church Manager <no-reply@churchmanager.local>';
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const { error } = await this.client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      if (error) {
        throw new Error(`${error.name}: ${error.message}`);
      }
      this.logger.log(`E-mail enviado para ${message.to}: ${message.subject}`);
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail via Resend: ${error}`);
      throw new InternalServerErrorException(
        'Não foi possível enviar o e-mail.',
      );
    }
  }
}
