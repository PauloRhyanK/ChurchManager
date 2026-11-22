import { createSong, uploadSongAudio, type Song, type SongAudio } from "../api/worship-api";
import { readAudioDuration } from "./format";

/** Os passos que de fato rodam ao organizar uma música (nada de alinhamento de áudio ainda). */
export function organizeSteps(hasAudio: boolean): string[] {
  const steps = ["Lendo a letra", "Separando versos e refrão", "Montando os slides", "Sugerindo o clima de cada parte"];
  return hasAudio ? [...steps, "Enviando o áudio"] : steps;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cria a música já organizada e, se houver arquivo, envia o áudio.
 * `onStep` recebe o índice do passo em andamento, para a tela de carregamento.
 * Se o áudio falhar, a música já existe: o erro volta em `audioError`.
 */
export async function createOrganizedSong(
  input: { title: string; rawLyrics: string; file: File | null; audio?: SongAudio | null },
  onStep: (index: number) => void,
  stepMs = 350,
): Promise<{ song: Song; audioError: unknown }> {
  onStep(0);
  // A organização é uma chamada só; os passos seguintes mostram o que ela fez.
  const [created] = await Promise.all([
    createSong({
      title: input.title,
      rawLyrics: input.rawLyrics,
      organize: true,
      audio: input.audio ?? undefined,
    }),
    pause(stepMs),
  ]);
  for (let i = 1; i < 4; i++) {
    onStep(i);
    await pause(stepMs);
  }
  if (!input.file) return { song: created, audioError: null };
  onStep(4);
  try {
    const duration = await readAudioDuration(input.file);
    return { song: await uploadSongAudio(created.id, input.file, duration), audioError: null };
  } catch (err) {
    return { song: created, audioError: err };
  }
}
