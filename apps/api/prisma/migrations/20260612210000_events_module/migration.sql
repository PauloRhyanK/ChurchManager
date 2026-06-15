-- Módulo editorial de eventos (migrado do Supabase igreja-paraiso)
-- Inclui tenant_id para multitenancy Church Manager

CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "time_start" TIME(0),
    "time_end" TIME(0),
    "location" VARCHAR(255),
    "image_url" TEXT,
    "tag" VARCHAR(64),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "message" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "day_of_week" VARCHAR(16) NOT NULL,
    "time_start" TIME(0) NOT NULL,
    "location" VARCHAR(255),
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "events"
    ADD CONSTRAINT "events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registrations"
    ADD CONSTRAINT "event_registrations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedules"
    ADD CONSTRAINT "schedules_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "event_registrations_event_email_unique"
    ON "event_registrations"("event_id", "email");

CREATE INDEX "events_tenant_id_idx" ON "events"("tenant_id");
CREATE INDEX "events_tenant_id_date_idx" ON "events"("tenant_id", "date");
CREATE INDEX "events_tenant_id_published_idx" ON "events"("tenant_id", "published");

CREATE INDEX "event_registrations_tenant_id_idx" ON "event_registrations"("tenant_id");
CREATE INDEX "event_registrations_event_id_idx" ON "event_registrations"("event_id");
CREATE INDEX "event_registrations_email_idx" ON "event_registrations"("email");
CREATE INDEX "event_registrations_user_id_idx" ON "event_registrations"("user_id");

CREATE INDEX "schedules_tenant_id_idx" ON "schedules"("tenant_id");
CREATE INDEX "schedules_tenant_id_active_idx" ON "schedules"("tenant_id", "active");
