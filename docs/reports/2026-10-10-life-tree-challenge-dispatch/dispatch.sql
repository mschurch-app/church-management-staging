-- Authorized one-time October test dispatch. Insert-only; no identity values embedded.
WITH eligible AS MATERIALIZED (
  SELECT p.line_subject, row_number() OVER (ORDER BY random()) AS position
  FROM public.tree_reading_october_test_participants p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tree_reading_october_test_challenges c
    WHERE c.line_subject=p.line_subject AND c.challenge_date=DATE '2026-10-10'
  )
), kinds AS MATERIALIZED (
  SELECT array_agg(kind ORDER BY random()) AS types
  FROM unnest(ARRAY['worm','wind','typhoon','trouble']::text[]) AS t(kind)
), inserted AS (
  INSERT INTO public.tree_reading_october_test_challenges
    (line_subject,challenge_date,challenge_type)
  SELECT e.line_subject,DATE '2026-10-10',k.types[(((e.position-1)%4)+1)::int]
  FROM eligible e CROSS JOIN kinds k
  WHERE (now() AT TIME ZONE 'Asia/Taipei')::date=DATE '2026-10-10'
    AND (SELECT count(*) FROM public.tree_reading_october_test_participants)=5
  ON CONFLICT (line_subject,challenge_date) DO NOTHING
  RETURNING id,challenge_type,status,triggered_at
)
SELECT jsonb_build_object(
  'inserted_count',(SELECT count(*) FROM inserted),
  'inserted_rows',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM inserted i),
  'type_counts',(SELECT jsonb_object_agg(challenge_type,n) FROM (
    SELECT challenge_type,count(*) AS n FROM inserted GROUP BY challenge_type
  ) c)
) AS dispatch_result;
