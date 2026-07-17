import { Global, Module } from '@nestjs/common';
import { Mailer } from './mailer';
import { ResendMailer } from './resend.mailer';

/**
 * Infraestrutura de e-mail. A porta {@link Mailer} é o único ponto de contacto
 * das regras de negócio; a implementação (Resend) é intercambiável trocando o
 * `useClass` abaixo.
 */
@Global()
@Module({
  providers: [{ provide: Mailer, useClass: ResendMailer }],
  exports: [Mailer],
})
export class MailModule {}
