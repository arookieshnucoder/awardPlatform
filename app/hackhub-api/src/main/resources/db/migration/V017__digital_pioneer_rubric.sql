-- Only initialize recognized Digital Pioneer campaigns with no existing rubric.
-- Existing custom criteria and historical scores are preserved for explicit review.
WITH eligible AS (
    SELECT id FROM hackathons h
    WHERE (lower(title) LIKE '%digital pioneer%' OR title LIKE '%数字先锋%')
      AND NOT EXISTS (SELECT 1 FROM voting_criteria c WHERE c.hackathon_id = h.id)
)
INSERT INTO voting_criteria (hackathon_id, name, description, weight, display_order)
SELECT e.id, r.name, r.description, r.weight, r.display_order
FROM eligible e CROSS JOIN (VALUES
    ('Behavior', 'Track-specific behavior demonstrated by the nominee', 70, 0),
    ('Business Impact', 'Measured customer or business outcomes', 30, 1)
) AS r(name, description, weight, display_order);

UPDATE hackathons SET judging_mode = 'panel', panel_weight = 100
WHERE (lower(title) LIKE '%digital pioneer%' OR title LIKE '%数字先锋%')
  AND (SELECT count(*) FROM voting_criteria c WHERE c.hackathon_id = hackathons.id) = 2
  AND EXISTS (SELECT 1 FROM voting_criteria c WHERE c.hackathon_id = hackathons.id AND c.name = 'Behavior' AND c.weight = 70)
  AND EXISTS (SELECT 1 FROM voting_criteria c WHERE c.hackathon_id = hackathons.id AND c.name = 'Business Impact' AND c.weight = 30);
