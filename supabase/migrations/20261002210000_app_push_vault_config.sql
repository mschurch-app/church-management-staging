create or replace function public.get_app_push_vapid_config()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public_key', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'church_os_vapid_public_key' order by created_at desc limit 1), ''),
    'private_key', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'church_os_vapid_private_key' order by created_at desc limit 1), ''),
    'subject', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'church_os_vapid_subject' order by created_at desc limit 1), 'mailto:james@tcsc.org.tw')
  );
$$;
revoke all on function public.get_app_push_vapid_config() from public, anon, authenticated;
grant execute on function public.get_app_push_vapid_config() to service_role;

