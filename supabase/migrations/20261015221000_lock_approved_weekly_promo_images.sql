begin;

create or replace function public.lock_approved_weekly_promo_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated'
    and (
      new.hero_image_path is distinct from old.hero_image_path
      or new.reel_cover_image_path is distinct from old.reel_cover_image_path
      or new.speaker_photo_path is distinct from old.speaker_photo_path
    )
    and exists (
      select 1 from public.website_weekly_promos p
      where p.bulletin_id = old.id
        and p.church_id = old.church_id
        and p.status = 'approved'
    )
  then
    raise exception 'Approved Sunday promo images cannot be changed in the bulletin'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_approved_weekly_promo_images on public.website_weekly_bulletins;
create trigger lock_approved_weekly_promo_images
before update of hero_image_path, reel_cover_image_path, speaker_photo_path
on public.website_weekly_bulletins
for each row execute function public.lock_approved_weekly_promo_images();

commit;
