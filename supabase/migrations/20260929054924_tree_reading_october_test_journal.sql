create table if not exists public.tree_reading_october_test_journal (
  line_subject text not null references public.tree_reading_october_test_participants(line_subject) on delete cascade,
  reading_date date not null check (reading_date between date '2026-10-01' and date '2026-10-31'),
  note text not null check (char_length(note) between 1 and 500),
  passage text not null,
  saved_at timestamptz not null default now(),
  primary key (line_subject, reading_date)
);
create index if not exists tree_reading_october_test_journal_date_idx
  on public.tree_reading_october_test_journal (line_subject, reading_date desc);
alter table public.tree_reading_october_test_journal enable row level security;
revoke all on public.tree_reading_october_test_journal from anon, authenticated;
comment on table public.tree_reading_october_test_journal is
  'Private reading reflections for the isolated October 2026 test; accessed only through the LINE-verified Edge Function.';
