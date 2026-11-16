-- Short-lived server-issued setup capabilities; never contain a Facebook token.
create table public.association_story_connection_tickets (
 ticket_hash text primary key check(ticket_hash ~ '^[a-f0-9]{64}$'),
 expected_page_id text not null default '311251732221816' check(expected_page_id='311251732221816'),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 used_at timestamptz, verified_page_id text,
 check(expires_at>created_at and expires_at<=created_at+interval '20 minutes')
);
alter table public.association_story_connection_tickets enable row level security;
revoke all on public.association_story_connection_tickets from public,anon,authenticated;
grant all on public.association_story_connection_tickets to service_role;
create function public.complete_association_story_connection(p_hash text,p_page_id text,p_name text,p_ciphertext text,p_iv text)
returns boolean language plpgsql security definer set search_path='' as $$
declare ticket public.association_story_connection_tickets;
begin
 select * into ticket from public.association_story_connection_tickets where ticket_hash=p_hash for update;
 if not found or ticket.used_at is not null or ticket.expires_at<=now() then raise exception 'forbidden'; end if;
 if p_page_id not in ('311251732221816','100064745854212') then raise exception 'channel_mismatch'; end if;
 if length(p_ciphertext) not between 30 and 4000 or length(p_iv)<>16 then raise exception 'invalid_input'; end if;
 update public.association_story_settings set page_id=p_page_id,page_name=left(p_name,200),page_url='https://www.facebook.com/tcsca/',token_ciphertext=p_ciphertext,token_iv=p_iv,connected_by=null,connected_at=now(),updated_at=now() where id=true;
 if not found then raise exception 'configuration_failed'; end if;
 update public.association_story_connection_tickets set used_at=now(),verified_page_id=p_page_id where ticket_hash=p_hash;
 return true;
end $$;
revoke all on function public.complete_association_story_connection(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_association_story_connection(text,text,text,text,text) to service_role;
