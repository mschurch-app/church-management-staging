begin;

-- A card is counted only after LINE's share picker reports success. The
-- recipient is deliberately neither requested nor stored.
alter table public.line_share_assets add column if not exists sent_at timestamptz;
create index if not exists line_share_assets_sent_idx
  on public.line_share_assets(church_id,line_user_id,sent_at desc)
  where sent_at is not null;

-- The game may match a published schedule name only after an active LINE
-- binding and a unique current member name have both been established.
create or replace function public.tree_mission_member_name(p_church text,p_subject text)
returns text language sql stable security definer set search_path='' as $$
  select m.name from church_auth.member_bindings b
  join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
  where b.church_id=p_church and b.line_subject=p_subject and b.active
    and b.login_channel_id='2011645391'
    and (select count(*) from public.members peer
         where peer.church_id=m.church_id and peer.archived_at is null and btrim(peer.name)=btrim(m.name))=1
  limit 1
$$;
revoke all on function public.tree_mission_member_name(text,text) from public,anon,authenticated;
grant execute on function public.tree_mission_member_name(text,text) to service_role;

commit;
