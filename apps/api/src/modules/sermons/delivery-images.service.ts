import { BadRequestException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import {
  MAX_SLIDE_PNG_BYTES,
  SLIDE_PNG_FORMAT_MESSAGE,
  SLIDE_PNG_TOO_LARGE_MESSAGE,
  StorageService,
  pngDimensions,
} from '../storage/storage.service';
import { readDeliverySlides } from './delivery-copy';
import {
  SLIDE_HASH_PATTERN,
  SLIDE_IMAGE_HEIGHT,
  SLIDE_IMAGE_WIDTH,
  deliveryVersion,
  readSlideImages,
  slideHash,
  slideImageKey,
} from './delivery-images';
import type { PublicSlide, SlideStyle } from './sermon-slides';
import { SermonsService } from './sermons.service';

export interface DeliveryImageSlide {
  index: number;
  hash: string;
  /** Exatamente o slide da cópia entregue: é isto que o painel desenha. */
  slide: PublicSlide;
  imageUrl: string | null;
}
export interface DeliveryImages {
  style: SlideStyle;
  version: string;
  slides: DeliveryImageSlide[];
}

const slidesChanged = () => new BadRequestException('A lista de slides mudou. Atualize a página.');

/**
 * As imagens PNG dos slides do envio, desenhadas pelo painel e guardadas no R2 para a Ponte.
 * Só o autor: a palavra é sempre lida por `findOwned` (tenant e autor do JWT).
 */
@Injectable()
export class SermonDeliveryImagesService {
  private readonly logger = new Logger(SermonDeliveryImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sermons: SermonsService,
    private readonly storage: StorageService,
  ) {}

  private async ownedDelivery(user: AuthUser, sermonId: string) {
    const sermon = await this.sermons.findOwned(user, sermonId);
    if (!sermon.delivery) throw new NotFoundException('Esta palavra não foi enviada para um culto.');
    const delivery = sermon.delivery;
    const slides = readDeliverySlides(delivery.slides);
    const hashes = slides.map((slide) => slideHash(delivery.slideStyle, slide));
    return { delivery, slides, hashes };
  }

  /** A lista para o painel. Tira do mapa (e do R2) as imagens de slides que não existem mais. */
  async list(user: AuthUser, sermonId: string): Promise<DeliveryImages> {
    const { delivery, slides, hashes } = await this.ownedDelivery(user, sermonId);
    const images = readSlideImages(delivery.slideImages);
    const current = new Set(hashes);
    const stale = Object.keys(images).filter((hash) => !current.has(hash));
    if (stale.length > 0) await this.prune(user.tenantId, delivery.id, stale, images);
    return {
      style: delivery.slideStyle,
      version: deliveryVersion(delivery.slideStyle, delivery.title, hashes),
      slides: slides.map((slide, index) => ({
        index,
        hash: hashes[index],
        slide,
        imageUrl: images[hashes[index]] ?? null,
      })),
    };
  }

  /** Limpeza de melhor esforço: uma falha fica no log e não derruba a lista. */
  private async prune(tenantId: string, deliveryId: string, stale: string[], images: Record<string, string>) {
    try {
      await this.prisma.$executeRaw`UPDATE sermon_deliveries SET slide_images = slide_images - ${stale}::text[] WHERE id = ${deliveryId}::uuid AND tenant_id = ${tenantId}::uuid`;
    } catch (error) {
      this.logger.warn(`Falha ao limpar imagens antigas do envio ${deliveryId}: ${error}`);
      return;
    }
    for (const hash of stale) {
      try {
        await this.storage.deleteFileByPublicUrl(images[hash]);
      } catch (error) {
        this.logger.warn(`Falha ao remover a imagem ${hash} do envio ${deliveryId}: ${error}`);
      }
    }
  }

  /** Grava a imagem de um slide atual na chave do hash e registra o URL no envio. */
  async upload(user: AuthUser, sermonId: string, hash: string, file: { buffer?: Buffer } | undefined) {
    if (!SLIDE_HASH_PATTERN.test(hash)) throw slidesChanged();
    const { delivery, hashes } = await this.ownedDelivery(user, sermonId);
    if (!hashes.includes(hash)) throw slidesChanged();

    const buffer = file?.buffer;
    if (!buffer || buffer.length === 0) throw new BadRequestException('Arquivo não enviado.');
    if (buffer.length > MAX_SLIDE_PNG_BYTES) throw new PayloadTooLargeException(SLIDE_PNG_TOO_LARGE_MESSAGE);
    const size = pngDimensions(buffer);
    if (!size) throw new BadRequestException(SLIDE_PNG_FORMAT_MESSAGE);
    if (size.width !== SLIDE_IMAGE_WIDTH || size.height !== SLIDE_IMAGE_HEIGHT) {
      throw new BadRequestException('A imagem do slide precisa ter 1920×1080 pixels.');
    }

    const imageUrl = await this.storage.uploadPng(buffer, slideImageKey(user.tenantId, delivery.id, hash));
    // Atômico: duas imagens subindo ao mesmo tempo não apagam uma à outra.
    await this.prisma.$executeRaw`UPDATE sermon_deliveries SET slide_images = slide_images || jsonb_build_object(${hash}::text, ${imageUrl}::text) WHERE id = ${delivery.id}::uuid AND tenant_id = ${user.tenantId}::uuid`;
    return { hash, imageUrl };
  }
}
