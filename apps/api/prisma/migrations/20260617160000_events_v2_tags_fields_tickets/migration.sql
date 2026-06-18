-- Events v2: formato presencial/online, detalhes para o site, tags reutilizáveis,
-- configuração financeira por ingresso e campos de inscrição (padrão + personalizados).

CREATE TYPE "EventFormat" AS ENUM ('IN_PERSON', 'ONLINE');
CREATE TYPE "TicketVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "EventFieldType" AS ENUM ('TEXT', 'EMAIL', 'PHONE', 'CPF', 'TEXTAREA', 'SELECT', 'CHECKBOX');

-- Evento: novos campos
ALTER TABLE "events"
  ADD COLUMN "format" "EventFormat" NOT NULL DEFAULT 'IN_PERSON',
  ADD COLUMN "online_url" VARCHAR(2048),
  ADD COLUMN "short_description" VARCHAR(500),
  ADD COLUMN "details_html" TEXT,
  ADD COLUMN "video_url" TEXT,
  ADD COLUMN "cover_image_url" TEXT,
  ADD COLUMN "media_meta" JSONB;

-- Retrocompatibilidade: copia imagem legada para a nova capa
UPDATE "events" SET "cover_image_url" = "image_url" WHERE "image_url" IS NOT NULL;

-- Tags reutilizáveis
CREATE TABLE "event_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_tags_on_events" (
    "event_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    CONSTRAINT "event_tags_on_events_pkey" PRIMARY KEY ("event_id", "tag_id")
);

ALTER TABLE "event_tags"
  ADD CONSTRAINT "event_tags_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_tags_on_events"
  ADD CONSTRAINT "event_tags_on_events_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_tags_on_events"
  ADD CONSTRAINT "event_tags_on_events_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "event_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "event_tags_tenant_id_slug_key" ON "event_tags"("tenant_id", "slug");
CREATE INDEX "event_tags_tenant_id_idx" ON "event_tags"("tenant_id");
CREATE INDEX "event_tags_on_events_tag_id_idx" ON "event_tags_on_events"("tag_id");

-- Migração de dados: events.tag (string única) -> EventTag + associação
INSERT INTO "event_tags" ("id", "tenant_id", "name", "slug", "created_at")
SELECT gen_random_uuid(), e."tenant_id", trimmed.name,
       lower(regexp_replace(trimmed.name, '[^a-zA-Z0-9]+', '-', 'g')),
       CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "tenant_id", btrim("tag") AS name
  FROM "events"
  WHERE "tag" IS NOT NULL AND btrim("tag") <> ''
) AS trimmed
JOIN "events" e ON e."tenant_id" = trimmed."tenant_id"
GROUP BY e."tenant_id", trimmed.name
ON CONFLICT ("tenant_id", "slug") DO NOTHING;

INSERT INTO "event_tags_on_events" ("event_id", "tag_id")
SELECT e."id", t."id"
FROM "events" e
JOIN "event_tags" t
  ON t."tenant_id" = e."tenant_id"
  AND t."slug" = lower(regexp_replace(btrim(e."tag"), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE e."tag" IS NOT NULL AND btrim(e."tag") <> ''
ON CONFLICT DO NOTHING;

-- Tipo de ingresso: novos campos
ALTER TABLE "event_ticket_types"
  ADD COLUMN "visibility" "TicketVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "allow_guest_registration" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "community_link" VARCHAR(2048),
  ADD COLUMN "allowed_billing_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "max_installments" INTEGER;

-- Ingressos existentes: permitir os métodos actualmente suportados
UPDATE "event_ticket_types"
  SET "allowed_billing_types" = ARRAY['PIX', 'BOLETO', 'CREDIT_CARD']::TEXT[];

-- Definições de campos de inscrição
CREATE TABLE "event_field_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "type" "EventFieldType" NOT NULL,
    "options" JSONB,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_field_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_ticket_type_fields" (
    "ticket_type_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "event_ticket_type_fields_pkey" PRIMARY KEY ("ticket_type_id", "field_id")
);

CREATE TABLE "event_registration_field_values" (
    "registration_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "event_registration_field_values_pkey" PRIMARY KEY ("registration_id", "field_id")
);

CREATE TABLE "event_order_field_values" (
    "order_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "event_order_field_values_pkey" PRIMARY KEY ("order_id", "field_id")
);

ALTER TABLE "event_field_definitions"
  ADD CONSTRAINT "event_field_definitions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_ticket_type_fields"
  ADD CONSTRAINT "event_ticket_type_fields_ticket_type_id_fkey"
  FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_ticket_type_fields"
  ADD CONSTRAINT "event_ticket_type_fields_field_id_fkey"
  FOREIGN KEY ("field_id") REFERENCES "event_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registration_field_values"
  ADD CONSTRAINT "event_registration_field_values_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registration_field_values"
  ADD CONSTRAINT "event_registration_field_values_field_id_fkey"
  FOREIGN KEY ("field_id") REFERENCES "event_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_order_field_values"
  ADD CONSTRAINT "event_order_field_values_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "event_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_order_field_values"
  ADD CONSTRAINT "event_order_field_values_field_id_fkey"
  FOREIGN KEY ("field_id") REFERENCES "event_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "event_field_definitions_tenant_id_key_key" ON "event_field_definitions"("tenant_id", "key");
CREATE INDEX "event_field_definitions_tenant_id_idx" ON "event_field_definitions"("tenant_id");
CREATE INDEX "event_ticket_type_fields_field_id_idx" ON "event_ticket_type_fields"("field_id");
CREATE INDEX "event_registration_field_values_field_id_idx" ON "event_registration_field_values"("field_id");
CREATE INDEX "event_order_field_values_field_id_idx" ON "event_order_field_values"("field_id");

-- Campos padrão do sistema por tenant
INSERT INTO "event_field_definitions" ("id", "tenant_id", "key", "label", "type", "is_system")
SELECT gen_random_uuid(), t."id", f.key, f.label, f.type::"EventFieldType", true
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('name', 'Nome completo', 'TEXT'),
    ('email', 'E-mail', 'EMAIL'),
    ('phone', 'Telefone', 'PHONE'),
    ('cpf', 'CPF', 'CPF')
) AS f(key, label, type)
ON CONFLICT ("tenant_id", "key") DO NOTHING;
