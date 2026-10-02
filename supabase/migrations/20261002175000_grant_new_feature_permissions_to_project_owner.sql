-- The project owner must retain full access to every Church OS feature.
insert into church_auth.grants(user_id,church_id,permission)
select o.user_id,c.church_id,p.permission
from church_auth.owners o
cross join (values ('M+'),('SHiNE')) c(church_id)
cross join (values ('newcomer_care'),('tree_reading_admin'),('binding_review'),('notification_settings'),('website_weekly'),('website_group_resources')) p(permission)
on conflict do nothing;
