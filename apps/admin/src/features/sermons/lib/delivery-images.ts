// Imagens dos slides da cópia entregue: o painel desenha o que falta e envia, um de cada vez.
import { getDeliveryImages, uploadDeliveryImage } from "../api/sermons-api";
import { loadSlideFonts, renderSlidePng } from "./slide-raster";

export type DeliveryImagesProgress = {
  /** Imagens já tentadas nesta rodada (enviadas ou com falha). */
  done: number;
  /** Imagens que faltavam no começo da rodada. */
  missing: number;
};

export type DeliveryImagesResult = {
  /** Slides da cópia entregue. */
  total: number;
  /** Quantas faltavam no começo da rodada. */
  missing: number;
  uploaded: number;
  failed: number;
};

const NONE: DeliveryImagesResult = { total: 0, missing: 0, uploaded: 0, failed: 0 };

const status = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Lê a lista da cópia entregue e, para cada slide sem imagem, desenha o PNG e envia (em sequência).
 * Sem envio (404), não há nada a fazer. Falha ao ler a lista sobe como erro; falha num slide conta em `failed`.
 */
export async function syncDeliveryImages(
  sermonId: string,
  onProgress?: (progress: DeliveryImagesProgress) => void,
): Promise<DeliveryImagesResult> {
  let list;
  try {
    list = await getDeliveryImages(sermonId);
  } catch (error) {
    if (status(error) === 404) return NONE;
    throw error;
  }
  const missing = list.slides.filter((s) => !s.imageUrl);
  let uploaded = 0;
  let failed = 0;
  onProgress?.({ done: 0, missing: missing.length });
  if (missing.length === 0) return { total: list.slides.length, missing: 0, uploaded: 0, failed: 0 };
  // Sem a fonte nenhuma imagem sai certa: a rodada para aqui e tudo conta como falha.
  try {
    await loadSlideFonts();
  } catch {
    onProgress?.({ done: missing.length, missing: missing.length });
    return { total: list.slides.length, missing: missing.length, uploaded: 0, failed: missing.length };
  }
  for (const item of missing) {
    try {
      const png = await renderSlidePng(item.slide, list.style);
      await uploadDeliveryImage(sermonId, item.hash, png);
      uploaded += 1;
    } catch {
      failed += 1;
    }
    onProgress?.({ done: uploaded + failed, missing: missing.length });
  }
  return { total: list.slides.length, missing: missing.length, uploaded, failed };
}
