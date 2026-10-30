import {
  CalendarDays,
  Church,
  Globe,
  HandHeart,
  LayoutTemplate,
  MapPin,
  Phone,
  Ticket,
  Users,
  UsersRound,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import type {
  SiteHomeBlock,
  SiteSectionDto,
} from "@/features/site/api/tenant-site-content-api";

/** Abas de Igreja, como aparecem em `?aba=`. */
export type ChurchTab =
  | "filiais"
  | "pastores"
  | "ministerios"
  | "agenda"
  | "ofertorio"
  | "site";

export type PreviewKind = "schedules" | "events" | "branches" | "pastors";

export interface FlowSource {
  /** Nome da origem ("Agenda Semanal", "Filiais"). */
  label: string;
  /** Aba de Igreja onde o dado é editado. */
  tab?: ChurchTab;
  /** Rota fora de Igreja (ex.: módulo Eventos). */
  href?: string;
  /** Frase curta mostrada no topo do painel de edição. */
  hint?: string;
}

export interface FlowBlock {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Seção do registry editada no painel lateral. Ausente quando o bloco vem todo de outro lugar. */
  sectionKey?: string;
  source?: FlowSource;
  preview?: PreviewKind;
  /** Resumo fixo, para blocos sem seção própria. */
  note?: string;
  /** Selo fixo no lugar da data de atualização. */
  badge?: string;
}

export const HOME_BLOCKS: Record<SiteHomeBlock, FlowBlock> = {
  mission: { id: "mission", title: "Missão / Sobre", icon: Church, sectionKey: "mission" },
  schedules: {
    id: "schedules",
    title: "Programação",
    icon: CalendarDays,
    source: { label: "Agenda Semanal", tab: "agenda" },
    preview: "schedules",
    note: "Horários de culto ativos, também no telão",
  },
  celulas: { id: "celulas", title: "Células", icon: Users, sectionKey: "celulas" },
  events: {
    id: "events",
    title: "Eventos",
    icon: Ticket,
    source: { label: "Eventos", href: "/eventos" },
    preview: "events",
    note: "Só aparece quando há evento publicado",
  },
  churches: {
    id: "churches",
    title: "Igrejas & Missões",
    icon: Globe,
    sectionKey: "churches",
    source: { label: "Filiais", tab: "filiais", hint: "As filiais vêm da aba Filiais." },
    preview: "branches",
  },
  giving: {
    id: "giving",
    title: "Ofertório",
    icon: HandHeart,
    sectionKey: "giving",
    source: {
      label: "Ofertório & Redes",
      tab: "ofertorio",
      hint: "PIX e dados bancários vêm da aba Ofertório & Redes.",
    },
  },
  youtube: { id: "youtube", title: "Transmissões", icon: Youtube, sectionKey: "youtube" },
};

export const FIXED_TOP: FlowBlock = {
  id: "hero",
  title: "Topo",
  icon: LayoutTemplate,
  note: "Sempre no início da página",
};

export const FIXED_BOTTOM: FlowBlock = {
  id: "contact",
  title: "Rodapé e contato",
  icon: Phone,
  sectionKey: "contact",
  source: {
    label: "Ofertório & Redes",
    tab: "ofertorio",
    hint: "Telefone, endereço e redes sociais vêm da aba Ofertório & Redes.",
  },
};

export const OTHER_PAGES: FlowBlock[] = [
  {
    id: "pastors",
    title: "Time Pastoral",
    icon: UsersRound,
    sectionKey: "pastors",
    source: { label: "Pastores", tab: "pastores", hint: "Os pastores vêm da aba Pastores." },
    preview: "pastors",
  },
  {
    id: "visit",
    title: "Venha nos visitar",
    icon: MapPin,
    sectionKey: "visit",
    badge: "Não aparece no site",
  },
  {
    id: "cotas",
    title: "Cotas",
    icon: HandHeart,
    source: { label: "Financeiro", href: "/financeiro", hint: "As cotas vêm do módulo Financeiro." },
  },
];

const RELATIVE_TIME = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

/** "há 2 dias" a partir da data de edição. */
export function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "Conteúdo original";

  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (Math.abs(diffMinutes) < 60) {
    return RELATIVE_TIME.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return RELATIVE_TIME.format(diffHours, "hour");
  }
  return RELATIVE_TIME.format(Math.round(diffHours / 24), "day");
}

/** Resumo de uma linha do que a seção contém. */
export function summarize(section: SiteSectionDto): string {
  for (const [, value] of Object.entries(section.value)) {
    if (Array.isArray(value)) {
      return `${value.length} ${value.length === 1 ? "item" : "itens"}`;
    }
  }
  // O texto mais longo é o mais descritivo — o primeiro campo costuma ser um
  // fragmento de título ("VENHA NOS"), que não diz nada de relance.
  const longest = Object.values(section.value)
    .filter((value): value is string => typeof value === "string")
    .sort((a, b) => b.length - a.length)[0];

  return longest?.trim() ? longest : "Sem conteúdo";
}
