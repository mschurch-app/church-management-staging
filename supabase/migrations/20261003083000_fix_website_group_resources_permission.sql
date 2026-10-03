drop policy if exists website_content_staff_select on public.website_content_posts;
drop policy if exists website_content_staff_insert on public.website_content_posts;
drop policy if exists website_content_staff_update on public.website_content_posts;
drop policy if exists website_content_staff_delete on public.website_content_posts;

create policy website_content_staff_select on public.website_content_posts for select to authenticated
using ((select church_auth.allowed(church_id,'website_group_resources')));
create policy website_content_staff_insert on public.website_content_posts for insert to authenticated
with check ((select church_auth.allowed(church_id,'website_group_resources')) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy website_content_staff_update on public.website_content_posts for update to authenticated
using ((select church_auth.allowed(church_id,'website_group_resources')))
with check ((select church_auth.allowed(church_id,'website_group_resources')) and updated_by=(select auth.uid()));
create policy website_content_staff_delete on public.website_content_posts for delete to authenticated
using ((select church_auth.allowed(church_id,'website_group_resources')));
