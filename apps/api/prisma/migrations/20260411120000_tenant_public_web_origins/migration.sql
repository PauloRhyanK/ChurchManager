-- Origens CORS por tenant para rotas públicas `/api/public/tenants/:slug/...`

CREATE TABLE "tenant_public_web_origins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "origin" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_public_web_origins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_public_web_origins_tenant_id_origin_key" ON "tenant_public_web_origins"("tenant_id", "origin");

CREATE INDEX "tenant_public_web_origins_tenant_id_idx" ON "tenant_public_web_origins"("tenant_id");

ALTER TABLE "tenant_public_web_origins" ADD CONSTRAINT "tenant_public_web_origins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
