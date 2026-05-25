-- Presets com "1 mês mensal" eram na prática cobrança dupla no Asaas; normalizar para pagamento único.
UPDATE "financial_link_presets"
SET "is_monthly" = FALSE,
    "subscription_duration_months" = NULL,
    "updated_at" = NOW()
WHERE "is_monthly" = TRUE
  AND "subscription_duration_months" = 1;
