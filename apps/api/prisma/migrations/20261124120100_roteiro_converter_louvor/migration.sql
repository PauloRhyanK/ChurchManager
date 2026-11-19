-- Converte os cultos que já existem: as músicas do bloco "Louvor" viram itens
-- do roteiro (momentos SONG), em sequência, no lugar do primeiro momento Louvor.
-- Culto com músicas e sem momento Louvor: as músicas vão para o fim.
-- Fica numa migração separada porque o Postgres não deixa usar o valor novo
-- do enum ('SONG') na mesma transação que o criou.
-- A tabela worship_service_songs continua igual (vira espelho da ordem dos SONG).

CREATE TEMP TABLE roteiro_conv ON COMMIT DROP AS
SELECT s.id AS service_id,
       w.id AS worship_id,
       COALESCE(w.sort_order, (SELECT COALESCE(MAX(m.sort_order), -1) + 1
                               FROM worship_service_moments m WHERE m.service_id = s.id)) AS anchor
FROM worship_services s
LEFT JOIN LATERAL (
  SELECT m.id, m.sort_order FROM worship_service_moments m
  WHERE m.service_id = s.id AND m.kind = 'WORSHIP'
  ORDER BY m.sort_order, m.id LIMIT 1
) w ON TRUE
WHERE EXISTS (SELECT 1 FROM worship_service_songs ss WHERE ss.service_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM worship_service_moments m WHERE m.service_id = s.id AND m.kind = 'SONG');

-- Abre espaço: cada posição antiga vira um múltiplo de 1000.
UPDATE worship_service_moments m SET sort_order = m.sort_order * 1000
FROM roteiro_conv c WHERE m.service_id = c.service_id;

-- As músicas entram logo depois da posição do Louvor (ou do fim), na ordem do roteiro.
INSERT INTO worship_service_moments (id, service_id, name, kind, duration_minutes, sort_order, song_id)
SELECT gen_random_uuid(), ss.service_id, LEFT(song.title, 120), 'SONG',
       GREATEST(1, CEIL(COALESCE(song.audio_duration_seconds, 300) / 60.0))::int,
       c.anchor * 1000 + ROW_NUMBER() OVER (PARTITION BY ss.service_id ORDER BY ss.sort_order, ss.id),
       ss.song_id
FROM worship_service_songs ss
JOIN roteiro_conv c ON c.service_id = ss.service_id
JOIN worship_songs song ON song.id = ss.song_id;

-- O bloco Louvor que as músicas substituíram sai.
DELETE FROM worship_service_moments m USING roteiro_conv c WHERE m.id = c.worship_id;

-- Numera de novo, 0..n, na ordem final.
UPDATE worship_service_moments m SET sort_order = r.rn - 1
FROM (
  SELECT m2.id, ROW_NUMBER() OVER (PARTITION BY m2.service_id ORDER BY m2.sort_order, m2.id) AS rn
  FROM worship_service_moments m2 JOIN roteiro_conv c ON c.service_id = m2.service_id
) r
WHERE m.id = r.id;
