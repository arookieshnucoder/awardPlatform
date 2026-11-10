-- Allow hard-deleting a profile even when it has authored records added after V001.

ALTER TABLE org_invitations
    DROP CONSTRAINT org_invitations_created_by_fkey,
    ADD CONSTRAINT org_invitations_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE hackathon_judges
    DROP CONSTRAINT hackathon_judges_invited_by_fkey,
    ADD CONSTRAINT hackathon_judges_invited_by_fkey
        FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE final_submissions
    DROP CONSTRAINT final_submissions_submitted_by_fkey,
    ADD CONSTRAINT final_submissions_submitted_by_fkey
        FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE,
    DROP CONSTRAINT final_submissions_idea_id_fkey,
    ADD CONSTRAINT final_submissions_idea_id_fkey
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE SET NULL;

ALTER TABLE judge_scores
    DROP CONSTRAINT judge_scores_criterion_id_fkey,
    ADD CONSTRAINT judge_scores_criterion_id_fkey
        FOREIGN KEY (criterion_id) REFERENCES voting_criteria(id) ON DELETE SET NULL;
