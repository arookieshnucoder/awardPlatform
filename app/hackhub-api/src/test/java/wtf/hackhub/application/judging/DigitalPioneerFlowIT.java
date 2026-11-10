package wtf.hackhub.application.judging;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.test.context.support.WithMockUser;
import wtf.hackhub.application.hackathon.CreateHackathonUseCase;
import wtf.hackhub.application.idea.SubmitIdeaUseCase;
import wtf.hackhub.domain.Idea;
import wtf.hackhub.infrastructure.persistence.idea.VotingCriteriaRepository;
import wtf.hackhub.support.PostgresIntegrationTest;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@WithMockUser(roles = "ADMIN")
class DigitalPioneerFlowIT extends PostgresIntegrationTest {

	@Autowired
	CreateHackathonUseCase createHackathon;
	@Autowired
	SubmitIdeaUseCase submitIdea;
	@Autowired
	InviteJudgeUseCase inviteJudge;
	@Autowired
	SubmitJudgeScoreUseCase submitEvaluation;
	@Autowired
	GetJudgeScoresUseCase getScores;
	@Autowired
	VotingCriteriaRepository criteriaRepository;

	@Test
	void nomination_and_committee_evaluation_round_trip() {
		UUID adminId = UUID.fromString(insertProfile("pioneer-admin@test.com", "Pioneer Admin", "admin"));
		UUID nomineeId = UUID.fromString(insertProfile("leoxu@bosch.com", "XU Leo", "participant"));
		UUID judgeId = UUID.fromString(insertProfile("judge@test.com", "Judge", "participant"));
		UUID unassignedId = UUID.fromString(insertProfile("unassigned@test.com", "Unassigned", "participant"));

		var award = createHackathon.execute(new CreateHackathonUseCase.Command("Digital Pioneer 2026",
				"Annual individual award", Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-12-31T23:59:59Z"),
				2, 100, adminId, null, List.of(), List.of()));

		var criteria = criteriaRepository.findAllByHackathonIdOrderByDisplayOrder(award.getId());
		assertThat(criteria).hasSize(2);
		assertThat(criteria.get(0).getName()).isEqualTo("Behavior");
		assertThat(criteria.get(0).getWeight()).isEqualTo(70);
		assertThat(criteria.get(1).getName()).isEqualTo("Business Impact");
		assertThat(criteria.get(1).getWeight()).isEqualTo(30);

		UUID teamId = UUID.fromString(jdbc.queryForObject(
				"INSERT INTO teams (name, description, hackathon_id, created_by) VALUES (?,?,?,?) RETURNING id::text",
				String.class, "Nominee individual team", "Individual nomination", award.getId(), adminId));
		jdbc.update("INSERT INTO team_members (team_id, user_id, role) VALUES (?,?,?)", teamId, adminId, "leader");

		String nomination = "[{\"type\":\"nomination\",\"nomineeUserId\":\"" + nomineeId
				+ "\",\"name\":\"Nominee\",\"orgCode\":\"BD/DPA-SRE3\"}]";
		var idea = submitIdea.executeNomination("Customer breakthrough", "Evidence", award.getId(), teamId, adminId,
				"Customer Values", List.of("digital-pioneer"), Idea.Status.SUBMITTED, "https://example.com/evidence",
				null, nomination);
		assertThat(idea.getProjectAttachments()).contains("BD/DPA-GOI7").contains("nomineeOrgCode");

		inviteJudge.execute(award.getId(), judgeId, adminId);
		var submitted = submitEvaluation
				.submitEvaluation(award.getId(), idea.getId(), judgeId,
						List.of(new SubmitJudgeScoreUseCase.CriterionScore(criteria.get(0).getId(), 9),
								new SubmitJudgeScoreUseCase.CriterionScore(criteria.get(1).getId(), 7)),
						"Strong evidence");
		assertThat(submitted).hasSize(2).allMatch(score -> "Strong evidence".equals(score.getComment()));

		var refreshed = getScores.getScoresForHackathon(award.getId(), judgeId, false);
		assertThat(refreshed).hasSize(2);
		assertThat(getScores.getSummary(award.getId())).singleElement().satisfies(summary -> {
			assertThat(summary.panelScore()).isEqualByComparingTo(new BigDecimal("8.40"));
			assertThat(summary.blendedScore()).isEqualByComparingTo(new BigDecimal("8.40"));
			assertThat(summary.judgeCount()).isEqualTo(1);
			assertThat(summary.rank()).isEqualTo(1);
		});

		assertThatThrownBy(() -> submitEvaluation.submitEvaluation(award.getId(), idea.getId(), unassignedId,
				List.of(new SubmitJudgeScoreUseCase.CriterionScore(criteria.get(0).getId(), 8),
						new SubmitJudgeScoreUseCase.CriterionScore(criteria.get(1).getId(), 8)),
				null)).isInstanceOf(SubmitJudgeScoreUseCase.NotAJudgeException.class);
	}
}
