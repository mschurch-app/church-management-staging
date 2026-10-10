WITH anchors AS (
SELECT p.line_subject,c.challenge_type FROM public.tree_reading_october_test_participants p
JOIN public.tree_reading_october_test_challenges c USING(line_subject)
WHERE c.challenge_date='2026-10-10'
), planned AS (
SELECT line_subject, date '2026-10-10'+offset_day AS challenge_date,
(ARRAY['worm','wind','typhoon','trouble']::text[])[1+((array_position(ARRAY['worm','wind','typhoon','trouble']::text[],challenge_type)-1+offset_day)%4)] AS challenge_type
FROM anchors CROSS JOIN generate_series(0,3) offsets(offset_day)
), coverage AS (
SELECT line_subject,count(*) AS total,count(DISTINCT challenge_type) AS types FROM planned GROUP BY line_subject
)
SELECT jsonb_build_object('planned_people',(SELECT count(*) FROM coverage),'people_with_four_distinct_types',(SELECT count(*) FROM coverage WHERE total=4 AND types=4),'planned_rows',(SELECT count(*) FROM planned),'future_rows_to_insert',(SELECT count(*) FROM planned WHERE challenge_date>'2026-10-10'),'per_day',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT challenge_date,count(*) AS count FROM planned GROUP BY challenge_date ORDER BY challenge_date)x),'read_only',true) AS dry_run;
