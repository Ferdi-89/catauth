import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FIDO2Credential, ProtectedLink, AuditLog } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return supabaseInstance;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

// Database helper operations with automatic fallback support
export const db = {
  // Credentials
  async getCredentials(): Promise<FIDO2Credential[] | null> {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb
        .from('credentials')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        credential_id: row.credential_id,
        label: row.label,
        sign_count: row.sign_count || 0,
        transports: row.transports || ['nfc'],
        is_active: row.is_active ?? true,
        revocation_reason: row.revocation_reason,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
      }));
    } catch (err) {
      console.warn('Supabase getCredentials error:', err);
      return null;
    }
  },

  async insertCredential(cred: FIDO2Credential): Promise<FIDO2Credential | null> {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb
        .from('credentials')
        .upsert({
          id: cred.id,
          user_id: cred.user_id,
          credential_id: cred.credential_id,
          label: cred.label,
          sign_count: cred.sign_count || 0,
          transports: cred.transports || ['nfc'],
          is_active: cred.is_active ?? true,
          created_at: cred.created_at || new Date().toISOString(),
        }, { onConflict: 'credential_id' })
        .select()
        .single();
      if (error) throw error;
      return data as FIDO2Credential;
    } catch (err) {
      console.warn('Supabase insertCredential error:', err);
      return null;
    }
  },

  async updateCredentialStatus(credentialId: string, isActive: boolean, reason?: string) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb
        .from('credentials')
        .update({
          is_active: isActive,
          revocation_reason: isActive ? null : (reason || 'Admin revoked'),
          revoked_at: isActive ? null : new Date().toISOString(),
        })
        .or(`credential_id.eq.${credentialId},id.eq.${credentialId}`)
        .select();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Supabase updateCredentialStatus error:', err);
      return null;
    }
  },

  // Protected Links
  async getProtectedLinks(): Promise<ProtectedLink[] | null> {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb
        .from('protected_links')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        slug: row.slug || row.id,
        title: row.title,
        description: row.description || '',
        target_redirect_url: row.target_redirect_url,
        allowed_card_ids: row.allowed_card_ids || [],
        require_pin: Boolean(row.require_pin),
        geofence_enabled: Boolean(row.geofence_enabled),
        is_active: row.is_active ?? true,
        total_taps: row.total_taps || 0,
        successful_passes: row.successful_passes || 0,
        blocked_attempts: row.blocked_attempts || 0,
        created_at: row.created_at,
      }));
    } catch (err) {
      console.warn('Supabase getProtectedLinks error:', err);
      return null;
    }
  },

  async upsertProtectedLink(link: ProtectedLink): Promise<ProtectedLink | null> {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb
        .from('protected_links')
        .upsert({
          id: link.id,
          slug: link.slug || link.id,
          title: link.title,
          description: link.description || '',
          target_redirect_url: link.target_redirect_url,
          allowed_card_ids: link.allowed_card_ids || [],
          require_pin: Boolean(link.require_pin),
          geofence_enabled: Boolean(link.geofence_enabled),
          is_active: link.is_active ?? true,
          total_taps: link.total_taps || 0,
          successful_passes: link.successful_passes || 0,
          blocked_attempts: link.blocked_attempts || 0,
          created_at: link.created_at || new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProtectedLink;
    } catch (err) {
      console.warn('Supabase upsertProtectedLink error:', err);
      return null;
    }
  },

  async deleteProtectedLink(id: string): Promise<boolean> {
    const sb = getSupabase();
    if (!sb) return false;
    try {
      const { error } = await sb.from('protected_links').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  },

  // Audit Logs
  async insertAuditLog(log: AuditLog) {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.from('audit_logs').insert({
        id: log.id,
        event_type: log.event_type,
        link_id: log.link_id || null,
        link_title: log.link_title || null,
        card_id: log.card_id || null,
        card_label: log.card_label || null,
        ip_address: log.ip_address || null,
        country: log.country || 'ID',
        status: log.status,
        created_at: log.created_at || new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Supabase insertAuditLog error:', err);
    }
  },
};
