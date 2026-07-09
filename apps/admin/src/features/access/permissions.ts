import type { PermissionLevel, PermissionModule } from "@/lib/auth-storage";

export interface PermissionModuleMeta {
  module: PermissionModule;
  label: string;
  description: string;
}

/** Módulos passíveis de permissão, com rótulos em português para a UI. */
export const PERMISSION_MODULES: PermissionModuleMeta[] = [
  {
    module: "DASHBOARD",
    label: "Visão geral",
    description: "Painel inicial e indicadores.",
  },
  {
    module: "EVENTS",
    label: "Eventos",
    description: "Eventos, etiquetas, campos e programação.",
  },
  {
    module: "EVENT_REGISTRATIONS",
    label: "Inscrições",
    description: "Inscrições em eventos.",
  },
  {
    module: "EVENT_TICKETS",
    label: "Ingressos",
    description: "Tipos de ingresso dos eventos.",
  },
  {
    module: "FINANCIAL",
    label: "Financeiro",
    description: "Cotas, presets e links de pagamento.",
  },
  {
    module: "SITE",
    label: "Site",
    description: "Conteúdo público do site (em breve).",
  },
  {
    module: "SETTINGS",
    label: "Configurações",
    description: "Credenciais Asaas e origens públicas.",
  },
  {
    module: "USERS",
    label: "Equipe",
    description: "Utilizadores, grupos e convites.",
  },
];

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  VIEW: "Ver",
  EDIT: "Editar",
};

export const ADMIN_USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PENDING_APPROVAL: "Pendente",
  INVITED: "Convidado",
  SUSPENDED: "Suspenso",
};

export interface PermissionEntry {
  module: PermissionModule;
  level: PermissionLevel;
}

export interface GroupTemplate {
  name: string;
  description: string;
  entries: PermissionEntry[];
}

/** Modelos prontos para acelerar a criação de grupos. */
export const GROUP_TEMPLATES: GroupTemplate[] = [
  {
    name: "Leitor de eventos",
    description: "Consulta eventos e inscrições, sem editar.",
    entries: [
      { module: "EVENTS", level: "VIEW" },
      { module: "EVENT_REGISTRATIONS", level: "VIEW" },
    ],
  },
  {
    name: "Editor de eventos",
    description: "Gere eventos, inscrições e ingressos.",
    entries: [
      { module: "EVENTS", level: "EDIT" },
      { module: "EVENT_REGISTRATIONS", level: "EDIT" },
      { module: "EVENT_TICKETS", level: "EDIT" },
    ],
  },
  {
    name: "Financeiro",
    description: "Acesso completo ao módulo financeiro.",
    entries: [{ module: "FINANCIAL", level: "EDIT" }],
  },
  {
    name: "Gestor de equipe",
    description: "Gere utilizadores e vê configurações.",
    entries: [
      { module: "USERS", level: "EDIT" },
      { module: "SETTINGS", level: "VIEW" },
    ],
  },
];
