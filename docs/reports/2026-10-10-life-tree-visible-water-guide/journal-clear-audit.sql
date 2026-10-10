-- Executed once on 2026-10-10 against svwgfgyxxgbqabosriom,
-- after the user explicitly requested deletion of past test journals.
-- Audit only. Do not re-run. User later changed preference to retain notes;
-- deletion had already committed and no restorable backup was found.
begin;
do $$ begin
  if (select count(*) from public.tree_reading_october_test_journal) <> 5
     or (select count(*) from public.tree_reading_october_test_journal
         where reading_date between date '2026-10-01' and date '2026-10-04') <> 5
  then raise exception 'Journal scope changed; no deletion'; end if;
end $$;
delete from public.tree_reading_october_test_journal
where reading_date between date '2026-10-01' and date '2026-10-04';
commit;

-- Read-only independent confirmation after commit:
-- journal 5 -> 0; progress 43 -> 43;
-- progress checksum before/after: 32325f43cb27da7d1b1fa3869c63bc8f;
-- participants 5 -> 5; challenges 12 -> 12.
