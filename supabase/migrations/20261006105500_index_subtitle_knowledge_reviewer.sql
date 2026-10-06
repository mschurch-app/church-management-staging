create index if not exists sermon_subtitle_knowledge_reviewer_idx
  on public.sermon_subtitle_knowledge (reviewed_by)
  where reviewed_by is not null;
