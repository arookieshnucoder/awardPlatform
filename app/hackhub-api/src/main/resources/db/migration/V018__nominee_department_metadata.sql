-- Backfill existing nominations using the same unique email/name roster match
-- as NomineeDirectory. Do not invent a department for an unmatched associate.
WITH profile_identities AS (
    SELECT p.id, p.name,
        (SELECT string_agg(token[1], '' ORDER BY token[1])
         FROM regexp_matches(lower(regexp_replace(split_part(p.email, '@', 1), '^fixed-term[._-]*', '', 'i')), '[a-z0-9]+', 'g') token
         WHERE token[1] NOT IN ('mr', 'ms', 'mrs', 'dr')) AS email_key,
        (SELECT string_agg(token[1], '' ORDER BY token[1])
         FROM regexp_matches(lower(regexp_replace(p.name, '^.*/', '')), '[a-z0-9]+', 'g') token
         WHERE token[1] NOT IN ('mr', 'ms', 'mrs', 'dr')) AS name_key
    FROM profiles p
), unique_roster AS (
    SELECT normalized_name, min(organizational_unit) AS org_code
    FROM voting_participants
    WHERE trim(organizational_unit) <> ''
    GROUP BY normalized_name HAVING count(*) = 1
), resolved AS (
    SELECT p.id, p.name, coalesce(e.org_code, n.org_code) AS org_code
    FROM profile_identities p
    LEFT JOIN unique_roster e ON e.normalized_name = p.email_key
    LEFT JOIN unique_roster n ON n.normalized_name = p.name_key
), enriched AS (
    SELECT i.id, jsonb_agg(
        CASE WHEN item->>'type' = 'nomination' AND r.org_code IS NOT NULL THEN
            (item - 'orgCode') || jsonb_build_object('nomineeUserId', r.id::text, 'name', r.name, 'nomineeOrgCode', trim(r.org_code))
        ELSE item END ORDER BY ordinal
    ) AS attachments
    FROM ideas i
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(i.project_attachments) = 'array' THEN i.project_attachments ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entries(item, ordinal)
    LEFT JOIN resolved r ON r.id::text = coalesce(item->>'nomineeUserId', i.created_by::text)
    GROUP BY i.id
)
UPDATE ideas i SET project_attachments = enriched.attachments
FROM enriched WHERE i.id = enriched.id AND i.project_attachments IS DISTINCT FROM enriched.attachments;
