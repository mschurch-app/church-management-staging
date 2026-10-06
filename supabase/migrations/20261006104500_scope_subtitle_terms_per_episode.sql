drop index if exists public.sermon_subtitle_knowledge_term_unique_idx;

create unique index sermon_subtitle_knowledge_term_unique_idx
  on public.sermon_subtitle_knowledge (
    church_id,
    coalesce(source_draft_id, '00000000-0000-0000-0000-000000000000'::uuid),
    knowledge_type,
    coalesce(wrong_text, ''),
    correct_text
  )
  where knowledge_type <> 'approved_example';
