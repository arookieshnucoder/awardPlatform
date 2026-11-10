-- Legacy test projects were stored with screenshots only. Their creator is the
-- existing voter-rule fallback; make that same identity visible on award cards.
UPDATE ideas i SET project_attachments =
    (CASE WHEN jsonb_typeof(i.project_attachments)='array' THEN i.project_attachments ELSE '[]'::jsonb END)
    || jsonb_build_array(jsonb_build_object('type','nomination','url','',
        'nomineeUserId',p.id::text,'name',p.name,'nomineeOrgCode',p.org_code))
FROM profiles p, hackathons h
WHERE p.id=i.created_by AND h.id=i.hackathon_id AND p.org_code IS NOT NULL
  AND (lower(h.title) LIKE '%digital pioneer%' OR h.title LIKE '%数字先锋%')
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(i.project_attachments)='array' THEN i.project_attachments ELSE '[]'::jsonb END
  ) entry WHERE entry->>'type'='nomination');

-- Use the exact same official-track mapping as the award UI and AwardTrack.
-- Existing ballots remain attached to their cases, and are counted together by
-- the corrected rule. A voter can explicitly reset any legacy invalid ballot.
WITH canonical AS (
    SELECT i.id, CASE
        WHEN lower(trim(category))='customer values' THEN 'Customer Values'
        WHEN lower(trim(category))='innovation breakthrough' THEN 'Innovation Breakthrough'
        WHEN lower(trim(category))='collaboration to win' THEN 'Collaboration to Win'
        WHEN trim(category)='AI & Intelligence' THEN 'Innovation Breakthrough'
        WHEN trim(category)='Digital Transformation' THEN 'Customer Values'
        WHEN trim(category)='Green & Sustainability' THEN 'Collaboration to Win'
        WHEN lower(category || ' ' || array_to_string(i.tags,' ')) ~ 'collaborat|team|shared|cross.?department|together|silo' THEN 'Collaboration to Win'
        WHEN lower(category || ' ' || array_to_string(i.tags,' ')) ~ 'customer|client|user|experience|service|process|value' THEN 'Customer Values'
        ELSE 'Innovation Breakthrough' END AS track
    FROM ideas i JOIN hackathons h ON h.id=i.hackathon_id
    WHERE lower(h.title) LIKE '%digital pioneer%' OR h.title LIKE '%数字先锋%'
)
UPDATE ideas i SET category=c.track FROM canonical c WHERE i.id=c.id AND i.category IS DISTINCT FROM c.track;
