import { cache } from 'react';
import { getSupabaseClient } from './supabase';
import type { Event, SiteSection, Tenant } from '../types';

/**
 * Fetch a tenant by its URL slug.
 * Wrapped in React's `cache()` so multiple calls in the same render
 * are deduplicated automatically.
 */
export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();
  if (error) {
    console.error('getTenantBySlug error:', error.message);
    return null;
  }
  return data as Tenant;
});

/**
 * Fetch upcoming (future) active events for a given tenant.
 * Always filters by tenant_id explicitly to avoid cross-tenant leakage,
 * even though the RLS policy already enforces this for authenticated users.
 */
export const getUpcomingEvents = cache(async (tenantId: string): Promise<Event[]> => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('events')
    .select('id, tenant_id, title, date, description, banner_url, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .gte('date', new Date().toISOString())
    .order('date', { ascending: true });
  if (error) {
    console.error('getUpcomingEvents error:', error.message);
    return [];
  }
  return (data ?? []) as Event[];
});

/**
 * Fetch a specific site section's content for a given tenant.
 */
export const getSiteSection = cache(
  async (tenantId: string, sectionKey: string): Promise<SiteSection | null> => {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client
      .from('site_sections')
      .select('id, tenant_id, section_key, content')
      .eq('tenant_id', tenantId)
      .eq('section_key', sectionKey)
      .single();
    if (error) {
      console.error(`getSiteSection(${sectionKey}) error:`, error.message);
      return null;
    }
    return data as SiteSection;
  },
);
