package wtf.hackhub.infrastructure.persistence.idea;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import wtf.hackhub.domain.IdeaVote;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IdeaVoteRepository extends JpaRepository<IdeaVote, UUID> {
	Optional<IdeaVote> findByIdeaIdAndUserId(UUID ideaId, UUID userId);
	boolean existsByIdeaIdAndUserId(UUID ideaId, UUID userId);
	long countByIdeaId(UUID ideaId);

	@Query("SELECT v.ideaId FROM IdeaVote v WHERE v.userId = :userId AND v.ideaId IN :ideaIds")
	List<UUID> findVotedIdeaIds(UUID userId, List<UUID> ideaIds);
	List<IdeaVote> findAllByUserId(UUID userId);

	@Query(value = """
			SELECT v.* FROM idea_votes v
			JOIN ideas i ON i.id = v.idea_id
			WHERE v.user_id = :userId AND i.hackathon_id = :hackathonId
			""", nativeQuery = true)
	List<IdeaVote> findAllByUserIdAndHackathonId(UUID userId, UUID hackathonId);
}
