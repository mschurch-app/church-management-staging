import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import { createHandler } from './handler.mjs';

// Disabled by default. No deployment/config.toml change is included in this phase.
// Accept only existing Church OS Supabase sessions, not raw LIFF/LINE ID tokens.
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
function isPublishable(value: string) {
  if (value.startsWith('sb_publishable_')) return true;
  try {
    const part = value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))).role === 'anon';
  } catch { return false; }
}
const configured = /^https:\/\/[^/?#]+$/.test(url) && isPublishable(key);
Deno.serve(createHandler({
  enabled: Deno.env.get('PERSONAL_MAIL_SETTINGS_ENABLED') === 'true',
  createUserClient: configured ? (token: string) => createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) : undefined,
}));
