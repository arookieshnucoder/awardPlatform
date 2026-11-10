package wtf.hackhub.infrastructure.persistence.idea;

import org.springframework.data.jpa.repository.JpaRepository;
import wtf.hackhub.domain.VotingParticipant;

import java.util.List;

public interface VotingParticipantRepository extends JpaRepository<VotingParticipant, String> {

	List<VotingParticipant> findAllByNormalizedName(String normalizedName);
}
