alter table public.sermon_subtitle_knowledge
  add column if not exists reviewed_by uuid references public.pastoral_staff(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists sermon_subtitle_knowledge_source_idx
  on public.sermon_subtitle_knowledge (source_draft_id, source_segment_index, updated_at desc);

update public.sermon_subtitle_knowledge
set source_draft_id = 'bbe6c130-72dc-4f74-aae7-00b55aad6663',
    updated_at = now()
where church_id = 'M+'
  and source_draft_id is null
  and knowledge_type in ('glossary', 'correction')
  and correct_text in (
    'GOOD TV', 'MIS 工程師', 'M+ 大雅教會', '吳俊璋牧師', '馬可福音',
    '五餅二魚', '服事', '傳福音', '曠野', '退修會', '門徒', '男丁',
    '憐憫', '牧人', '33節到35節'
  );
