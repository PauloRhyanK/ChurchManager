import { Logger, Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { BibleController } from './bible/bible.controller';
import { BIBLE_SOURCE, BibleService, PrismaBibleSource } from './bible/bible.service';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicStructurer } from './ai/anthropic-structurer';
import { ANTHROPIC_CLIENT_OPTIONS } from './ai/anthropic-client';
import { GenerationLimiter } from './ai/generation-limiter';
import { SERMON_AI_CONFIG, describeSermonAiConfig, readSermonAiConfig, type SermonAiConfig } from './ai/sermon-ai.config';
import { STRUCTURERS } from './ai/sermon-structurer';
import { STRUCTURE_LIMITER, SermonImportService } from './sermon-import.service';
import { SermonDeliveryService } from './sermon-delivery.service';
import { SermonSlidesService } from './sermon-slides.service';
import { SermonsController } from './sermons.controller';
import { SermonsService } from './sermons.service';

/** Um cliente do SDK para a API toda; nulo sem chave. */
const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

/** Palavras: biblioteca privada de pregações de cada pregador. */
@Module({
  imports: [AuthModule, AccessModule],
  // 'bible/search' e 'bible/translations' têm dois segmentos e ':id' só um, então as rotas não colidem; a ordem aqui não importa.
  controllers: [BibleController, SermonsController],
  providers: [
    SermonsService,
    SermonDeliveryService,
    SermonSlidesService,
    SermonImportService,
    BibleService,
    { provide: BIBLE_SOURCE, useClass: PrismaBibleSource },
    {
      provide: SERMON_AI_CONFIG,
      useFactory: () => {
        // Uma vez na subida: ligada ou não, quantos modelos e as entradas ignoradas (nunca a chave).
        const logger = new Logger('SermonsModule');
        for (const line of describeSermonAiConfig(process.env)) logger.log(line);
        return readSermonAiConfig(process.env);
      },
    },
    // Sem chave não se cria o cliente do SDK: a API sobe sem nenhuma variável de IA.
    { provide: ANTHROPIC_CLIENT, inject: [SERMON_AI_CONFIG], useFactory: (config: SermonAiConfig) => (config.enabled ? new Anthropic(ANTHROPIC_CLIENT_OPTIONS) : null) },
    {
      provide: STRUCTURERS,
      inject: [ANTHROPIC_CLIENT],
      useFactory: (client: Anthropic | null) => (client ? { anthropic: new AnthropicStructurer(client) } : {}),
    },
    // Singleton: o limite de "Colar texto" por usuário vale para a API toda (em memória, por processo).
    { provide: STRUCTURE_LIMITER, useFactory: () => new GenerationLimiter() },
  ],
  exports: [SermonsService, SermonDeliveryService],
})
export class SermonsModule {}
