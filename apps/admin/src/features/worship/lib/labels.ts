import type { Mood, Pending, SongStatus } from "./document";

export interface MoodMeta {
  label: string;
  /** Cor do clima na tela (a luz de verdade é decidida na Ponte). */
  color: string;
  foreground: string;
  hint: string;
  /** 1 (mais baixo) a 5 (mais forte): altura no gráfico de energia. */
  level: number;
}

export const MOOD_META: Record<Mood, MoodMeta> = {
  CONTEMPLATIVE: { label: "Contemplativo", color: "#1E3A8A", foreground: "#FFFFFF", hint: "Luz baixa, quase parada", level: 1 },
  WORSHIP: { label: "Adoração", color: "#5B45B8", foreground: "#FFFFFF", hint: "Suave, respira devagar", level: 2 },
  BUILD: { label: "Crescendo", color: "#0F766E", foreground: "#FFFFFF", hint: "Sobe aos poucos", level: 3 },
  CELEBRATION: { label: "Celebração", color: "#FBBF24", foreground: "#422006", hint: "Cheia e em movimento", level: 4 },
  EXPLOSION: { label: "Explosão", color: "#F97316", foreground: "#431407", hint: "O ponto mais forte", level: 5 },
};

export interface Situation {
  label: string;
  textClass: string;
  dotClass: string;
}

/** Pronta, Falta o tempo, Rascunho; e "Falta conferir" quando só falta marcar como pronta. */
export function situationOf(status: SongStatus, pending: Pending[]): Situation {
  if (status === "READY") return { label: "Pronta", textClass: "text-green-800", dotClass: "bg-green-600" };
  if (status === "DRAFT") return { label: "Rascunho", textClass: "text-gray-600", dotClass: "bg-gray-400" };
  const onlyConfirm = pending.length === 1 && pending[0] === "CONFIRM";
  return {
    label: onlyConfirm ? "Falta conferir" : "Falta o tempo",
    textClass: "text-amber-800",
    dotClass: "bg-amber-500",
  };
}

export const PENDING_LABEL: Record<Pending, string> = {
  AUDIO: "enviar o áudio",
  TIMES: "marcar o tempo de todos os slides",
  MOODS: "escolher o clima de todas as partes",
  CONFIRM: "marcar como pronta",
};
