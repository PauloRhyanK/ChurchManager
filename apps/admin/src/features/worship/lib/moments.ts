import type { MomentKind } from "../api/worship-api";

export const MOMENT_KIND_LABEL: Record<MomentKind, string> = {
  PRE_SERVICE: "Antes do culto",
  GENERIC: "Momento",
  WORSHIP: "Louvor",
  SERMON: "Palavra",
};
export const MOMENT_KINDS = Object.keys(MOMENT_KIND_LABEL) as MomentKind[];
/** Mesmo teto da API. */
export const MAX_MOMENTS = 40;
