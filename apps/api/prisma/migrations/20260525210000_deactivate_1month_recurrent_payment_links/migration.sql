-- Links "mensal + 1 mês" antigos (RECURRENT no Asaas) — desactivar na BD para forçar novo link DETACHED.
UPDATE "financial_payment_links"
SET "active" = FALSE,
    "updated_at" = NOW()
WHERE "is_monthly" = TRUE
  AND "subscription_duration_months" = 1
  AND "active" = TRUE;
