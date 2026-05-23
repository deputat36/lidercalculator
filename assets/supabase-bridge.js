// Shared Supabase client for CRM «Лидер» optional extensions.
// The key is publishable; access is controlled by Supabase RLS policies.
window.LEADER_SUPABASE_URL = 'https://ofewxuqfjhamgerwzull.supabase.co';
window.LEADER_SUPABASE_KEY = 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs';
window.LEADER_SUPABASE_AUTH_STORAGE = 'leader_session_v1';

if (window.supabase && !window.db) {
  window.db = window.supabase.createClient(window.LEADER_SUPABASE_URL, window.LEADER_SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: window.LEADER_SUPABASE_AUTH_STORAGE
    }
  });
}
