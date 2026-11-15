-- CreateTable
CREATE TABLE "financial_contributor_access_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cpf" CHAR(11) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_contributor_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_contributor_access_tokens_token_hash_key" ON "financial_contributor_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "financial_contributor_access_tokens_tenant_id_cpf_idx" ON "financial_contributor_access_tokens"("tenant_id", "cpf");

-- AddForeignKey
ALTER TABLE "financial_contributor_access_tokens" ADD CONSTRAINT "financial_contributor_access_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
