package wtf.hackhub.infrastructure.persistence.idea;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import wtf.hackhub.domain.IdeaScore;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IdeaScoreRepository extends JpaRepository<IdeaScore, UUID> {
	Optional<IdeaScore> findByIdeaIdAndUserIdAndCriteriaId(UUID ideaId, UUID userId, UUID criteriaId);
	List<IdeaScore> findAllByIdeaId(UUID ideaId);

	@Query("""
			SELECT COALESCE(SUM(
			    (SELECT AVG(CAST(s2.score AS double)) FROM IdeaScore s2
			     WHERE s2.ideaId = :ideaId AND s2.criteriaId = vc.id)
			    * vc.weight / 100.0
			), 0)
			FROM VotingCriteria vc
			WHERE vc.hackathonId = :hackathonId
			""")
	BigDecimal calculateWeightedScore(UUID ideaId, UUID hackathonId);

	@Query("SELECT COUNT(DISTINCT s.userId) FROM IdeaScore s WHERE s.ideaId = :ideaId")
	int countDistinctVoters(UUID ideaId);

	interface CommunitySummary {
		UUID getIdeaId();
		int getVoterCount();
		BigDecimal getWeightedScore();
	}

	@Query(value = """
			WITH scores AS (
			    SELECT s.* FROM idea_scores s
			    JOIN ideas i ON i.id = s.idea_id
			    WHERE i.hackathon_id = :hackathonId
			), voters AS (
			    SELECT idea_id, COUNT(DISTINCT user_id) AS voter_count FROM scores GROUP BY idea_id
			), averages AS (
			    SELECT idea_id, criteria_id, AVG(CAST(score AS double precision)) AS average_score
			    FROM scores GROUP BY idea_id, criteria_id
			), weighted AS (
			    SELECT a.idea_id, SUM(a.average_score * vc.weight / 100.0) AS weighted_score
			    FROM averages a JOIN voting_criteria vc ON vc.id = a.criteria_id
			    WHERE vc.hackathon_id = :hackathonId GROUP BY a.idea_id
			)
			SELECT i.id AS "ideaId", COALESCE(v.voter_count, 0) AS "voterCount",
			       COALESCE(w.weighted_score, 0) AS "weightedScore"
			FROM ideas i LEFT JOIN voters v ON v.idea_id = i.id LEFT JOIN weighted w ON w.idea_id = i.id
			WHERE i.hackathon_id = :hackathonId
			""", nativeQuery = true)
	List<CommunitySummary> summarizeByHackathon(UUID hackathonId);

}
