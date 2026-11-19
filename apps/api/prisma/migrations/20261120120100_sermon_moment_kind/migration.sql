-- O valor SERMON do enum foi criado na migração anterior (o Postgres não deixa
-- usá-lo na mesma transação). Aqui os cultos já criados passam a usar o tipo.
UPDATE "worship_service_moments" SET "kind" = 'SERMON' WHERE "name" = 'Palavra' AND "kind" = 'GENERIC';

UPDATE "worship_service_templates" t SET "moments" = (
  SELECT jsonb_agg(
    CASE WHEN m->>'name' = 'Palavra' AND m->>'kind' = 'GENERIC'
         THEN jsonb_set(m, '{kind}', '"SERMON"') ELSE m END
    ORDER BY ord)
  FROM jsonb_array_elements(t."moments") WITH ORDINALITY AS e(m, ord)
) WHERE jsonb_typeof(t."moments") = 'array' AND jsonb_array_length(t."moments") > 0;
