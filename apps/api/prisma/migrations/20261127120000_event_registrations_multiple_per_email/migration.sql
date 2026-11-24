-- Permite várias inscrições no mesmo evento com o mesmo e-mail
-- (ex.: responsável que inscreve familiares usando o próprio e-mail).
DROP INDEX IF EXISTS "event_registrations_event_email_unique";

CREATE INDEX "event_registrations_event_email_idx" ON "event_registrations"("event_id", "email");
