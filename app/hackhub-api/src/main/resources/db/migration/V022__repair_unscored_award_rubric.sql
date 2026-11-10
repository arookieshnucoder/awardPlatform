-- Repair the screenshot's unchanged four test criteria, or an empty award rubric.
-- Custom standards and campaigns with any existing score are preserved.
WITH eligible AS (
    SELECT h.id FROM hackathons h
    WHERE (lower(h.title) LIKE '%digital pioneer%' OR h.title LIKE '%数字先锋%')
      AND NOT EXISTS (SELECT 1 FROM judge_scores s WHERE s.hackathon_id=h.id)
      AND NOT EXISTS (SELECT 1 FROM idea_scores s JOIN ideas i ON i.id=s.idea_id WHERE i.hackathon_id=h.id)
      AND (
        NOT EXISTS (SELECT 1 FROM voting_criteria c WHERE c.hackathon_id=h.id)
        OR (
          (SELECT count(*) FROM voting_criteria c WHERE c.hackathon_id=h.id)=4
          AND (SELECT count(*) FROM voting_criteria c WHERE c.hackathon_id=h.id
               AND c.name IN ('111111','22222','333333','444444') AND c.weight=25)=4
        )
      )
), removed AS (
    DELETE FROM voting_criteria c USING eligible e WHERE c.hackathon_id=e.id RETURNING c.id
)
INSERT INTO voting_criteria(hackathon_id,name,description,weight,display_order)
SELECT e.id,r.name,r.description,r.weight,r.display_order
FROM eligible e CROSS JOIN (VALUES
    ('Behavior Demonstration','Track-specific behavior demonstrated by the nominee',70,0),
    ('Business Impact','Measured customer or business outcomes',30,1)
) AS r(name,description,weight,display_order);

UPDATE hackathons h SET judging_mode='panel',panel_weight=100
WHERE (lower(h.title) LIKE '%digital pioneer%' OR h.title LIKE '%数字先锋%')
  AND (SELECT count(*) FROM voting_criteria c WHERE c.hackathon_id=h.id)=2
  AND EXISTS (SELECT 1 FROM voting_criteria c WHERE c.hackathon_id=h.id AND c.name ~* 'behaviou?r' AND c.weight=70)
  AND EXISTS (SELECT 1 FROM voting_criteria c WHERE c.hackathon_id=h.id AND c.name ~* 'business|impact' AND c.weight=30);
