package wtf.hackhub.application.hackathon;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.test.context.support.WithMockUser;
import wtf.hackhub.application.idea.VoteIdeaUseCase;
import wtf.hackhub.support.PostgresIntegrationTest;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@WithMockUser(roles = "ADMIN")
class AwardDeletionAndVoteResetIT extends PostgresIntegrationTest {
	@Autowired
	CreateHackathonUseCase createAward;
	@Autowired
	UpdateHackathonUseCase updateAward;
	@Autowired
	VoteIdeaUseCase votes;

	UUID award(UUID owner) {
		return createAward.execute(new CreateHackathonUseCase.Command("Test award", "Test evidence", Instant.now(),
				Instant.now().plusSeconds(86400), 4, 100, owner, null, List.of(), List.of())).getId();
	}

	UUID idea(UUID award, UUID owner) {
		return jdbc.queryForObject("INSERT INTO ideas(title,description,hackathon_id,created_by) VALUES ('Case','Evidence',?,?) RETURNING id",
				UUID.class, award, owner);
	}

	@Test
	void deleting_each_campaign_status_cascades_records_and_preserves_other_campaigns() {
		UUID owner = UUID.fromString(insertProfile("admin@fixture.test", "Admin", "admin"));
		UUID retained = award(owner);
		UUID retainedIdea = idea(retained, owner);
		for (String status : List.of("draft", "open", "running", "completed")) {
			UUID target = award(owner);
			jdbc.update("UPDATE hackathons SET status=? WHERE id=?", status, target);
			UUID idea = idea(target, owner);
			jdbc.update("INSERT INTO idea_votes(idea_id,user_id) VALUES (?,?)", idea, owner);
			jdbc.update("INSERT INTO comments(idea_id,user_id,content) VALUES (?,?,'Evidence')", idea, owner);
			jdbc.update("INSERT INTO hackathon_judges(hackathon_id,user_id,invited_by) VALUES (?,?,?)", target, owner, owner);
			UUID criterion = jdbc.queryForObject("INSERT INTO voting_criteria(hackathon_id,name,weight) VALUES (?,'Impact',100) RETURNING id", UUID.class, target);
			jdbc.update("INSERT INTO judge_scores(hackathon_id,idea_id,judge_id,criterion_id,score) VALUES (?,?,?,?,8)", target, idea, owner, criterion);
			jdbc.update("INSERT INTO idea_scores(idea_id,user_id,criteria_id,score) VALUES (?,?,?,8)", idea, owner, criterion);
			UUID team = jdbc.queryForObject("INSERT INTO teams(name,hackathon_id,created_by) VALUES ('Test team',?,?) RETURNING id", UUID.class, target, owner);
			jdbc.update("INSERT INTO final_submissions(hackathon_id,team_id,idea_id,title,submitted_by) VALUES (?,?,?,'Final case',?)", target, team, idea, owner);
			updateAward.delete(target);
			assertThat(jdbc.queryForObject("SELECT count(*) FROM hackathons WHERE id=?", Integer.class, target)).isZero();
			assertThat(jdbc.queryForObject("SELECT count(*) FROM ideas WHERE id=?", Integer.class, idea)).isZero();
			for (String table : List.of("idea_votes", "comments", "judge_scores", "idea_scores", "final_submissions")) {
				assertThat(jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE idea_id=?", Integer.class, idea)).isZero();
			}
			assertThat(jdbc.queryForObject("SELECT count(*) FROM hackathon_judges WHERE hackathon_id=?", Integer.class, target)).isZero();
			assertThat(jdbc.queryForObject("SELECT count(*) FROM voting_criteria WHERE hackathon_id=?", Integer.class, target)).isZero();
			assertThat(jdbc.queryForObject("SELECT count(*) FROM teams WHERE id=?", Integer.class, team)).isZero();
		}
		assertThat(jdbc.queryForObject("SELECT count(*) FROM ideas WHERE id=?", Integer.class, retainedIdea)).isOne();
	}

	@Test
	void resetting_all_votes_updates_counts_across_awards_and_preserves_other_users() {
		UUID owner = UUID.fromString(insertProfile("admin@fixture.test", "Admin", "admin"));
		UUID other = UUID.fromString(insertProfile("other@fixture.test", "Other", "participant"));
		UUID first = idea(award(owner), owner), second = idea(award(owner), owner);
		for (UUID id : List.of(first, second)) {
			jdbc.update("INSERT INTO idea_votes(idea_id,user_id) VALUES (?,?),(?,?)", id, owner, id, other);
		}
		votes.clearAll(owner);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE user_id=?", Integer.class, owner)).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE user_id=?", Integer.class, other)).isEqualTo(2);
		for (UUID id : List.of(first, second)) {
			assertThat(jdbc.queryForObject("SELECT votes FROM ideas WHERE id=?", Integer.class, id)).isOne();
		}
		votes.clearAll(owner);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes", Integer.class)).isEqualTo(2);
	}
}
