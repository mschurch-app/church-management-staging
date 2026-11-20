-- Approved screenshot catalog, 2026-11-20. Data only; preserve historical snapshots.
DO $catalog$
declare x record; pid uuid; mid uuid; old_online finance.online_donation_items%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('finance-giving-catalog-20261120',0));
 for x in select * from (values
('新希望基金會','1月小太陽計畫',102,null,'新希望基金會'),
('新希望基金會','2月小太陽計畫',103,null,'新希望基金會'),
('新希望基金會','3月小太陽計畫',104,null,'新希望基金會'),
('新希望基金會','4月小太陽計畫',105,null,'新希望基金會'),
('新希望基金會','5月小太陽計畫',106,null,'新希望基金會'),
('新希望基金會','6月小太陽計畫',107,null,'新希望基金會'),
('新希望基金會','7月小太陽計畫',108,null,'新希望基金會'),
('新希望基金會','8月小太陽計畫',109,null,'新希望基金會'),
('新希望基金會','9月小太陽計畫',110,null,'新希望基金會'),
('新希望基金會','10月小太陽計畫',111,null,'新希望基金會'),
('新希望基金會','11月小太陽計畫',112,null,'新希望基金會'),
('新希望基金會','12月小太陽計畫',113,null,'新希望基金會'),
('基督教救助協會','1月1919國中陪讀方案補助款',127,null,'救助協會陪讀方案'),
('基督教救助協會','1月1919陪讀方案補助款',128,null,'救助協會陪讀方案'),
('基督教救助協會','2月1919國中陪讀方案補助款',129,null,'救助協會陪讀方案'),
('基督教救助協會','2月1919陪讀方案補助款',130,null,'救助協會陪讀方案'),
('基督教救助協會','3月1919國中陪讀方案補助款',131,null,'救助協會陪讀方案'),
('基督教救助協會','3月1919陪讀方案補助款',132,null,'救助協會陪讀方案'),
('基督教救助協會','4月1919國中陪讀方案補助款',133,null,'救助協會陪讀方案'),
('基督教救助協會','4月1919陪讀方案補助款',134,null,'救助協會陪讀方案'),
('基督教救助協會','5月1919國中陪讀方案補助款',135,null,'救助協會陪讀方案'),
('基督教救助協會','5月1919陪讀方案補助款',136,null,'救助協會陪讀方案'),
('基督教救助協會','6月1919國中陪讀方案補助款',137,null,'救助協會陪讀方案'),
('基督教救助協會','6月1919陪讀方案補助款',138,null,'救助協會陪讀方案'),
('基督教救助協會','7月1919國中陪讀方案補助款',139,null,'救助協會陪讀方案'),
('基督教救助協會','7月1919陪讀方案補助款',140,null,'救助協會陪讀方案'),
('基督教救助協會','8月1919國中陪讀方案補助款',141,null,'救助協會陪讀方案'),
('基督教救助協會','8月1919陪讀方案補助款',142,null,'救助協會陪讀方案'),
('基督教救助協會','9月1919國中陪讀方案補助款',143,null,'救助協會陪讀方案'),
('基督教救助協會','9月1919陪讀方案補助款',144,null,'救助協會陪讀方案'),
('基督教救助協會','10月1919國中陪讀方案補助款',99,null,'救助協會陪讀方案'),
('基督教救助協會','10月1919陪讀方案補助款',100,null,'救助協會陪讀方案'),
('基督教救助協會','11月1919國中陪讀方案補助款',119,null,'救助協會陪讀方案'),
('基督教救助協會','11月1919陪讀方案補助款',120,null,'救助協會陪讀方案'),
('基督教救助協會','12月1919國中陪讀方案補助款',121,null,'救助協會陪讀方案'),
('基督教救助協會','12月1919陪讀方案補助款',122,null,'救助協會陪讀方案'),
('基督教救助協會','1919陪讀計畫假日體育班',123,null,'救助協會陪讀方案'),
('Ｍ＋大雅教會','十一奉獻',38,null,'為M+大雅教會奉獻'),
('Ｍ＋大雅教會','青年教會',150,'青少年事工奉獻','為M+大雅教會奉獻'),
('Ｍ＋大雅教會','一般奉獻',7,null,'為M+大雅教會奉獻'),
('Ｍ＋大雅教會','感恩奉獻',9,null,'為M+大雅教會奉獻'),
('Ｍ＋大雅教會','宣教奉獻',8,null,'為M+大雅教會奉獻'),
('Ｍ＋大雅教會','指定奉獻',6,null,'為M+大雅教會奉獻'),
('Ｍ＋大雅教會','建堂奉獻',19,null,'為M+大雅教會奉獻'),
('Ｍ＋大雅教會','遷堂奉獻',94,null,'為M+大雅教會奉獻'),
('Ｍ＋大雅教會','年度合併奉獻',156,null,'為M+大雅教會奉獻'),
('夢想加油站課輔班','2026弱勢兒少公益課輔班-夢想加油站',166,null,'弱勢兒少夢想加油站募款'),
('夢想加油站課輔班','2026弱勢兒少公益課輔班-夢想加油站（定期定額）',167,null,'弱勢兒少夢想加油站募款'),
('夢想加油站課輔班','2027弱勢兒少公益課輔班-夢想加油站',185,'2027弱勢兒少課後輔導班','弱勢兒少夢想加油站募款'),
('夢想加油站課輔班','2027弱勢兒少公益課輔班-夢想加油站（定期定額）',186,null,'弱勢兒少夢想加油站募款')
 ) v(project_name,item_name,external_no,alias_name,external_project) loop
  insert into finance.projects(name) values(x.project_name) on conflict do nothing;
  select id into strict pid from finance.projects where lower(btrim(name))=lower(btrim(x.project_name));
  select id into mid from finance.ministry_items where project_id=pid and name=x.item_name;
  if mid is null and x.alias_name is not null then
   select id into mid from finance.ministry_items where project_id=pid and name=x.alias_name;
   if mid is not null then
    update finance.ministry_items set name=x.item_name,version=version+1,updated_at=now() where id=mid;
   end if;
  end if;
  if mid is null then
   insert into finance.ministry_items(project_id,name) values(pid,x.item_name) returning id into mid;
  end if;
  select * into old_online from finance.online_donation_items where ministry_item_id=mid for update;
  if old_online.external_item_no is not null and (old_online.provider<>'eoffering' or old_online.external_item_no<>x.external_no) then
   raise exception 'catalog_external_conflict: % / %',x.project_name,x.item_name;
  end if;
  if exists(select 1 from finance.online_donation_items where provider='eoffering' and external_item_no=x.external_no and ministry_item_id<>mid) then
   raise exception 'catalog_external_conflict: %',x.external_no;
  end if;
  insert into finance.income_accounts(ministry_item_id,name) values(mid,x.item_name||'收入') on conflict(ministry_item_id) do nothing;
  insert into finance.online_donation_items(ministry_item_id,name,provider,external_item_no,external_project_name)
   values(mid,x.item_name,'eoffering',x.external_no,x.external_project)
   on conflict(ministry_item_id) do update set name=excluded.name,provider=excluded.provider,external_item_no=excluded.external_item_no,external_project_name=excluded.external_project_name
   where (finance.online_donation_items.name,finance.online_donation_items.provider,finance.online_donation_items.external_item_no,finance.online_donation_items.external_project_name)
   is distinct from (excluded.name,excluded.provider,excluded.external_item_no,excluded.external_project_name);
 end loop;
end $catalog$;
