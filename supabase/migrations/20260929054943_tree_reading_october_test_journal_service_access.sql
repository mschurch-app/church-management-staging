grant select, insert, update, delete on public.tree_reading_october_test_journal to service_role;
create policy "Edge function can manage October test journal"
  on public.tree_reading_october_test_journal
  for all to service_role using (true) with check (true);
