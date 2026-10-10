-- Pending user choice: execute only if 10/10 is confirmed as day 1.
-- Target: svwgfgyxxgbqabosriom (October isolated test), never main/old DB.
-- Insert-only: preserve today's assignments, completions and all progress/notes.
-- One statement is atomic; a failed guard rolls back every inserted row.
DO $rotation$
DECLARE
  roster_count integer;
  today_count integer;
  future_count integer;
  inserted_count integer;
BEGIN
  IF (now() AT TIME ZONE 'Asia/Taipei')::date <> DATE '2026-10-10' THEN
    RAISE EXCEPTION 'Rotation date changed; review the four-day range';
  END IF;
  PERFORM pg_advisory_xact_lock(20261010, 413);
  SELECT count(*) INTO roster_count FROM public.tree_reading_october_test_participants;
  SELECT count(*) INTO today_count
    FROM public.tree_reading_october_test_participants p
    JOIN public.tree_reading_october_test_challenges c USING (line_subject)
    WHERE c.challenge_date = DATE '2026-10-10';
  SELECT count(*) INTO future_count FROM public.tree_reading_october_test_challenges
    WHERE challenge_date BETWEEN DATE '2026-10-11' AND DATE '2026-10-13';
  IF roster_count <> 5 OR today_count <> 5 OR future_count <> 0 THEN
    RAISE EXCEPTION 'Rotation preconditions changed: roster %, today %, future %', roster_count, today_count, future_count;
  END IF;
  INSERT INTO public.tree_reading_october_test_challenges
    (line_subject, challenge_date, challenge_type)
  SELECT p.line_subject, DATE '2026-10-10' + offset_day,
    (ARRAY['worm','wind','typhoon','trouble']::text[])
      [1 + ((array_position(ARRAY['worm','wind','typhoon','trouble']::text[], c.challenge_type) - 1 + offset_day) % 4)]
  FROM public.tree_reading_october_test_participants p
  JOIN public.tree_reading_october_test_challenges c USING (line_subject)
  CROSS JOIN generate_series(1,3) AS offsets(offset_day)
  WHERE c.challenge_date = DATE '2026-10-10';
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> 15 THEN
    RAISE EXCEPTION 'Expected 15 future assignments, got %', inserted_count;
  END IF;
END
$rotation$;
