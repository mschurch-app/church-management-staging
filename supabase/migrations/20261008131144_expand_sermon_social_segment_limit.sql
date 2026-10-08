alter table public.sermon_social_segments
  drop constraint if exists sermon_social_segments_segment_index_check;

alter table public.sermon_social_segments
  add constraint sermon_social_segments_segment_index_check
  check (segment_index >= 0 and segment_index <= 29);
