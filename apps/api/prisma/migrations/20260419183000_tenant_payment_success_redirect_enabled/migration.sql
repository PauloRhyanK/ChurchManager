-- Redirecionamento pós-pagamento pode ser desligado sem apagar o URL guardado.
ALTER TABLE "tenants" ADD COLUMN "payment_success_redirect_enabled" BOOLEAN NOT NULL DEFAULT true;
