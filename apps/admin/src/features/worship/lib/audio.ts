export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.ogg,.flac,audio/*";
export const MAX_AUDIO_BYTES = 90 * 1024 * 1024;

/** Mesma regra da API: até 90 MB. Devolve a mensagem de erro, ou null. */
export function validateAudioFile(file: { size: number }): string | null {
  return file.size > MAX_AUDIO_BYTES ? "O áudio excede o limite de 90 MB. Prefira MP3 ou M4A." : null;
}
