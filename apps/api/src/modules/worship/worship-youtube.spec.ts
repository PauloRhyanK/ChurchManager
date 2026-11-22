import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVttLyrics, parseYoutubeVideoId, sanitizeYoutubeTitle } from './worship-youtube.service';

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

test('parseYoutubeVideoId: aceita ID solto e os formatos de link de vídeo do YouTube', () => {
  const id = 'dQw4w9WgXcQ';
  for (const raw of [
    id,
    `  ${id}  `,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}&t=42`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&list=RD`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `youtube.com/watch?v=${id}`,
  ]) {
    assert.equal(parseYoutubeVideoId(raw), id, raw);
  }
});

test('parseYoutubeVideoId: recusa o que não é vídeo do YouTube', () => {
  for (const raw of [
    '',
    'abc',
    'dQw4w9WgXcQx',
    'https://vimeo.com/dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/channel/UCxyz',
    'https://www.youtube.com/watch?v=curto',
    'javascript:alert(1)',
  ]) {
    assert.equal(parseYoutubeVideoId(raw), null, raw);
  }
});
