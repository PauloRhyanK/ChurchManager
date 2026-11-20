-- Imagens PNG dos slides da Palavra para a Ponte do Culto: mapa `hash do slide → url pública`.
ALTER TABLE "sermon_deliveries" ADD COLUMN "slide_images" JSONB NOT NULL DEFAULT '{}';
