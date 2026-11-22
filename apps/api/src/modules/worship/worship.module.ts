import Anthropic from '@anthropic-ai/sdk';
import { Logger, Module } from '@nestjs/common';
import { ANTHROPIC_CLIENT_OPTIONS } from '../sermons/ai/anthropic-summarizer';
import { GenerationLimiter } from '../sermons/ai/generation-limiter';
import { readSermonAiConfig, type SermonAiConfig } from '../sermons/ai/sermon-ai.config';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { SermonsModule } from '../sermons/sermons.module';
import { PublicWorshipPonteController, WorshipPonteKeyController } from './worship-ponte.controller';
import { WorshipPonteService } from './worship-ponte.service';
import { WorshipServicesController, WorshipTemplatesController } from './worship-services.controller';
import { WorshipServicesService } from './worship-services.service';
import { WorshipSongsController } from './worship-songs.controller';
import { WorshipSongsService } from './worship-songs.service';
import { TIMING_ALIGNER, TimingAligner, WORSHIP_AI_CONFIG } from './ai/timing-aligner';
import { WorshipTimingController } from './worship-timing.controller';
import { WorshipTimingService } from './worship-timing.service';
import { WorshipYoutubeService } from './worship-youtube.service';

/** Cultos: músicas (letra, tempo, clima, áudio-guia) e roteiro. */
@Module({
  imports: [AuthModule, AccessModule, SermonsModule],
  controllers: [
    WorshipSongsController,
    WorshipTimingController,
    WorshipServicesController,
    WorshipTemplatesController,
    WorshipPonteKeyController,
    PublicWorshipPonteController,
  ],
  providers: [
    WorshipSongsService,
    WorshipServicesService,
    WorshipPonteService,
    WorshipTimingService,
    WorshipYoutubeService,
    // A mesma chave e os mesmos modelos da IA das Palavras (SERMON_AI_MODELS; vale o primeiro).
    {
      provide: WORSHIP_AI_CONFIG,
      useFactory: () => {
        const config = readSermonAiConfig(process.env);
        new Logger('WorshipModule').log(`Ajuste de tempos por IA: ${config.enabled ? 'ligado' : 'desligado'}.`);
        return config;
      },
    },
    {
      provide: TIMING_ALIGNER,
      inject: [WORSHIP_AI_CONFIG],
      useFactory: (config: SermonAiConfig) =>
        config.enabled ? new TimingAligner(new Anthropic(ANTHROPIC_CLIENT_OPTIONS)) : null,
    },
    // Limite por usuário de pedidos à IA (30 por hora), em memória.
    { provide: GenerationLimiter, useFactory: () => new GenerationLimiter(30) },
  ],
})
export class WorshipModule {}
