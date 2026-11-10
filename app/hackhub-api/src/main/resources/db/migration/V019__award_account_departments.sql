-- Award account departments. HRL assignments are explicitly confirmed by the
-- project owner; BD test accounts use the unique match in BD Namelist.XLSX.
-- This field is not writable through self-service profile or registration APIs.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_code TEXT;

WITH identities AS (
    SELECT p.id,
        (SELECT string_agg(token[1], '' ORDER BY token[1])
         FROM regexp_matches(lower(regexp_replace(p.name, '^.*/', '')), '[a-z0-9]+', 'g') token
         WHERE token[1] NOT IN ('mr', 'ms', 'mrs', 'dr')) AS name_key
    FROM profiles p WHERE lower(p.email) LIKE 'bd-test.%@bosch.com'
), unique_roster AS (
    SELECT normalized_name, min(trim(organizational_unit)) AS org_code
    FROM voting_participants WHERE trim(organizational_unit) <> ''
    GROUP BY normalized_name HAVING count(*) = 1
)
UPDATE profiles p SET org_code = r.org_code
FROM identities i JOIN unique_roster r ON r.normalized_name = i.name_key
WHERE p.id = i.id AND p.org_code IS DISTINCT FROM r.org_code;

-- Includes both existing Yaolong accounts. Do not infer a department from role.
UPDATE profiles SET org_code = 'HRL'
WHERE lower(email) IN (
    'aah5sgh@bosch.com',
    'fixed-term.yaolong.zhang@cn.bosch.com',
    'lynette.li@cn.bosch.com',
    'yining.ma@cn.bosch.com',
    'fixed-term.yiheng.lu@cn.bosch.com'
) AND org_code IS DISTINCT FROM 'HRL';

UPDATE profiles SET role = 'participant'
WHERE lower(email) = 'fixed-term.yiheng.lu@cn.bosch.com'
  AND role <> 'participant';

-- Refresh only nomination metadata for the confirmed accounts, keeping files,
-- scores, votes, ownership, and other attachments intact.
WITH enriched AS (
    SELECT i.id, jsonb_agg(
        CASE WHEN item->>'type' = 'nomination' AND p.org_code IS NOT NULL THEN
            (item - 'orgCode') || jsonb_build_object('nomineeUserId', p.id::text,
                'name', p.name, 'nomineeOrgCode', p.org_code)
        ELSE item END ORDER BY ordinal
    ) AS attachments
    FROM ideas i
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(i.project_attachments) = 'array'
             THEN i.project_attachments ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entries(item, ordinal)
    LEFT JOIN profiles p ON p.id::text = coalesce(item->>'nomineeUserId', i.created_by::text)
    GROUP BY i.id
)
UPDATE ideas i SET project_attachments = e.attachments
FROM enriched e WHERE i.id = e.id AND i.project_attachments IS DISTINCT FROM e.attachments;
