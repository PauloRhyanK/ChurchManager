import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVttLyrics, sanitizeYoutubeTitle } from './worship-youtube.service';

test('sanitizeYoutubeTitle: remove marcadores comuns como (Clipe Oficial) e [Ao Vivo]', () => {
  assert.equal(
    sanitizeYoutubeTitle('Felipe Rodrigues - Gratidão (Clipe Oficial)'),
    'Felipe Rodrigues - Gratidão',
  );
  assert.equal(
    sanitizeYoutubeTitle('Gabriela Rocha - Me Atraiu [Ao Vivo]'),
    'Gabriela Rocha - Me Atraiu',
  );
  assert.equal(
    sanitizeYoutubeTitle('Morada - Só Tu És Santo (Lyric Video)'),
    'Morada - Só Tu És Santo',
  );
  assert.equal(
    sanitizeYoutubeTitle('A Casa É Sua - Casa Worship | Vídeo Oficial'),
    'A Casa É Sua - Casa Worship',
  );
});

test('parseVttLyrics: extrai texto de arquivo VTT limpando tags e deduplicando linhas', () => {
  const vtt = `WEBVTT
Kind: captions
Language: pt

00:00:01.000 --> 00:00:03.000
<c>Eu</c> Te agradeço Deus

00:00:03.000 --> 00:00:05.000
Eu Te agradeço Deus
Por tudo que tens feito

00:00:05.000 --> 00:00:07.000
Por tudo que tens feito
Minha vida transformou
`;

  const lyrics = parseVttLyrics(vtt);
  assert.equal(
    lyrics,
    'Eu Te agradeço Deus\nPor tudo que tens feito\nMinha vida transformou',
  );
});
