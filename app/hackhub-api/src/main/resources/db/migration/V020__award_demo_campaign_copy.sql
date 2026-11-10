-- Replace only the unchanged legacy demo copy still present in this award project.
-- Preserve user-edited campaigns and all related nominations, votes and scores.
UPDATE hackathons
SET title = '2026 Digital Pioneer Award',
    description = 'Recognizing contributions in Customer Values, Innovation Breakthrough, and Collaboration to Win.'
WHERE title = 'Spring 2026 Hackathon'
  AND description = 'Build something amazing in 48 hours. Open to all skill levels.';
