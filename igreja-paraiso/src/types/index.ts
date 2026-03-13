export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export interface Event {
  id: string;
  tenant_id: string;
  title: string;
  date: string;
  description: string | null;
  banner_url: string | null;
  is_active: boolean;
}

export interface SiteSection {
  id: string;
  tenant_id: string;
  section_key: string;
  content: Record<string, unknown>;
}
