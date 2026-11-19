import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { BibleController } from './bible/bible.controller';
import { BIBLE_SOURCE, BibleService, PrismaBibleSource } from './bible/bible.service';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicSummarizer } from './ai/anthropic-summarizer';
import { GenerationLimiter } from './ai/generation-limiter';
import { readSermonAiConfig, type SermonAiConfig } from './ai/sermon-ai.config';
import { SUMMARIZERS } from './ai/sermon-summarizer';
import { SermonDeliveryService } from './sermon-delivery.service';
import { SERMON_AI_CONFIG, SermonSlidesService } from './sermon-slides.service';
import { SermonsController } from './sermons.controller';
import { SermonsService } from './sermons.service';

/** Palavras: biblioteca privada de pregações de cada pregador. */
@Module({
  imports: [AuthModule, AccessModule],
  // 'bible/search' e 'bible/translations' têm dois segmentos e ':id' só um, então as rotas não colidem; a ordem aqui não importa.
  controllers: [BibleController, SermonsController],
  providers: [
    SermonsService,
    SermonDeliveryService,
    SermonSlidesService,
    BibleService,
    { provide: BIBLE_SOURCE, useClass: PrismaBibleSource },
    { provide: SERMON_AI_CONFIG, useFactory: () => readSermonAiConfig(process.env) },
    // Sem chave não se cria o cliente do SDK: a API sobe sem nenhuma variável de IA.
    {
      provide: SUMMARIZERS,
      inject: [SERMON_AI_CONFIG],
      useFactory: (config: SermonAiConfig) =>
        config.enabled ? { anthropic: new AnthropicSummarizer(new Anthropic({ maxRetries: 1, timeout: 60_000 })) } : {},
    },
    // Singleton: o limite por usuário vale para a API toda (em memória, por processo).
    { provide: GenerationLimiter, useFactory: () => new GenerationLimiter() },
  ],
  exports: [SermonsService, SermonDeliveryService],
})
export class SermonsModule {}
