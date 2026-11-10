package wtf.hackhub.application.idea;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import wtf.hackhub.application.storage.StoragePort;
import wtf.hackhub.domain.*;
import wtf.hackhub.infrastructure.persistence.hackathon.HackathonRepository;
import wtf.hackhub.infrastructure.persistence.idea.*;
import wtf.hackhub.support.PostgresIntegrationTest;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@WithMockUser(roles = "ADMIN")
class AwardReadBatchingIT extends PostgresIntegrationTest {
	@MockBean StoragePort storage;
	@Autowired HackathonRepository awards;
	@Autowired IdeaRepository ideas;
	@Autowired IdeaScoreRepository scores;
	@Autowired IdeaVoteRepository votes;
	@Autowired VotingCriteriaRepository criteria;
	@Autowired GetIdeasUseCase getIdeas;

	@Test
	void batch_aggregates_match_individual_queries_with_partial_scores_and_empty_nominations() {
		UUID firstUser = UUID.fromString(insertProfile("first@example.test", "First", "admin"));
		UUID secondUser = UUID.fromString(insertProfile("second@example.test", "Second", "participant"));
		var award = awards.save(new Hackathon("Award", "", Instant.now(), Instant.now().plusSeconds(3600),
				"TEST-AWARD", 4, 100, firstUser, null));
		var other = awards.save(new Hackathon("Other", "", Instant.now(), Instant.now().plusSeconds(3600),
				"TEST-OTHER", 4, 100, firstUser, null));
		var first = ideas.save(new Idea("First", "", award.getId(), null, firstUser, "Customer Values"));
		var partial = ideas.save(new Idea("Partial", "", award.getId(), null, firstUser, "Customer Values"));
		var empty = ideas.save(new Idea("Empty", "", award.getId(), null, firstUser, "Customer Values"));
		var foreign = ideas.save(new Idea("Other award", "", other.getId(), null, firstUser, "Customer Values"));
		var behavior = criteria.save(new VotingCriteria(award.getId(), "Behavior", "", 70, 0));
		var impact = criteria.save(new VotingCriteria(award.getId(), "Impact", "", 30, 1));
		var otherCriterion = criteria.save(new VotingCriteria(other.getId(), "Other", "", 100, 0));
		scores.saveAll(List.of(
				new IdeaScore(first.getId(), firstUser, behavior.getId(), 8),
				new IdeaScore(first.getId(), secondUser, behavior.getId(), 5),
				new IdeaScore(first.getId(), firstUser, impact.getId(), 9),
				new IdeaScore(partial.getId(), firstUser, behavior.getId(), 7),
				new IdeaScore(foreign.getId(), firstUser, otherCriterion.getId(), 10)));
		var batch = scores.summarizeByHackathon(award.getId()).stream()
				.collect(Collectors.toMap(IdeaScoreRepository.CommunitySummary::getIdeaId, Function.identity()));
		assertThat(batch).containsOnlyKeys(first.getId(), partial.getId(), empty.getId());
		for (var idea : List.of(first, partial, empty)) {
			assertThat(batch.get(idea.getId()).getVoterCount()).isEqualTo(scores.countDistinctVoters(idea.getId()));
			assertThat(batch.get(idea.getId()).getWeightedScore())
					.isEqualByComparingTo(scores.calculateWeightedScore(idea.getId(), award.getId()));
		}
		assertThat(batch.get(first.getId()).getVoterCount()).isEqualTo(2);
		assertThat(batch.get(empty.getId()).getWeightedScore()).isZero();

		votes.saveAll(List.of(new IdeaVote(first.getId(), firstUser), new IdeaVote(partial.getId(), secondUser),
				new IdeaVote(foreign.getId(), firstUser)));
		assertThat(getIdeas.votedIdeaIds(List.of(first.getId(), partial.getId(), empty.getId()), firstUser))
				.containsExactly(first.getId());
	}
}
