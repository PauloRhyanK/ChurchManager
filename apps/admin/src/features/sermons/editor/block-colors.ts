// Cores dos blocos do sermão, tiradas do desenho aprovado ("Palavra").
// background: fundo do bloco; accent: etiqueta/referência; dot: quadradinho na barra de ferramentas.
export type SermonBlockKind = "verse" | "point" | "illustration" | "application" | "privateNote";
export type CalloutKind = "illustration" | "application" | "privateNote";

export const BLOCK_COLORS: Record<SermonBlockKind, { background: string; accent: string; dot: string }> = {
  verse: { background: "#F6F4FD", accent: "#3F2A93", dot: "#6D54CF" },
  point: { background: "transparent", accent: "#030712", dot: "#030712" },
  illustration: { background: "#ECFDF5", accent: "#065F46", dot: "#059669" },
  application: { background: "#FFF7ED", accent: "#9A3412", dot: "#EA580C" },
  privateNote: { background: "#F3F4F6", accent: "#374151", dot: "#6B7280" },
};

export const BLOCK_LABELS: Record<SermonBlockKind, string> = {
  verse: "Versículo",
  point: "Ponto",
  illustration: "Ilustração",
  application: "Aplicação",
  privateNote: "Só para mim",
};
