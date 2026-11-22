package wtf.hackhub.application.judging;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import wtf.hackhub.domain.Hackathon;
import wtf.hackhub.domain.HackathonJudge;
import wtf.hackhub.domain.JudgeScore;
import wtf.hackhub.domain.Profile;
import wtf.hackhub.domain.Team;
import wtf.hackhub.domain.TeamMember;
import wtf.hackhub.domain.FinalSubmission;
import wtf.hackhub.infrastructure.persistence.auth.ProfileRepository;
import wtf.hackhub.infrastructure.persistence.hackathon.HackathonRepository;
import wtf.hackhub.infrastructure.persistence.judging.FinalSubmissionRepository;
import wtf.hackhub.infrastructure.persistence.judging.HackathonJudgeRepository;
import wtf.hackhub.infrastructure.persistence.judging.JudgeScoreRepository;
import wtf.hackhub.infrastructure.persistence.team.TeamMemberRepository;
import wtf.hackhub.infrastructure.persistence.team.TeamRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JudgingUseCasesTest {

	@Mock
	private wtf.hackhub.application.idea.NominationApprovalDirectory approvalDirectory;

	@org.mockito.Spy
	private com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();

	// ── RemoveJudgeUseCase ────────────────────────────────────────────────────

	@Mock
	wtf.hackhub.infrastructure.persistence.IdeaMutationLock mutationLock;

	@Mock
	HackathonJudgeRepository judgeRepository;

	@InjectMocks
	RemoveJudgeUseCase removeJudge;

	@Test
	void remove_judge_succeeds_when_exists() {
		UUID hackathonId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		when(judgeRepository.existsByHackathonIdAndUserId(hackathonId, userId)).thenReturn(true);

		removeJudge.execute(hackathonId, userId);

		verify(judgeRepository).deleteByHackathonIdAndUserId(hackathonId, userId);
	}

	@Test
	void remove_judge_throws_when_not_found() {
		UUID hackathonId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		when(judgeRepository.existsByHackathonIdAndUserId(hackathonId, userId)).thenReturn(false);

		assertThatThrownBy(() -> removeJudge.execute(hackathonId, userId))
				.isInstanceOf(RemoveJudgeUseCase.JudgeNotFoundException.class);
	}

	// ── SubmitJudgeScoreUseCase ───────────────────────────────────────────────

	@Mock
	JudgeScoreRepository scoreRepository;

	@Mock
	wtf.hackhub.infrastructure.persistence.idea.IdeaRepository ideaRepository;
	@Mock
	wtf.hackhub.infrastructure.persistence.idea.VotingCriteriaRepository criteriaRepository;
	@InjectMocks
	SubmitJudgeScoreUseCase submitScore;

	@Test
	void submit_score_saves_new_score_when_none_exists() {
		UUID hackathonId = UUID.randomUUID();
		UUID ideaId = UUID.randomUUID();
		UUID judgeId = UUID.randomUUID();
		UUID criterionId = UUID.randomUUID();
		JudgeScore saved = new JudgeScore(hackathonId, ideaId, judgeId, criterionId, 8, "Good");
		var idea = mock(wtf.hackhub.domain.Idea.class);
		when(idea.getHackathonId()).thenReturn(hackathonId);
		when(ideaRepository.findById(ideaId)).thenReturn(Optional.of(idea));
		when(criteriaRepository.findById(criterionId))
				.thenReturn(Optional.of(new wtf.hackhub.domain.VotingCriteria(hackathonId, "Behavior", "", 70, 0)));

		when(judgeRepository.existsByHackathonIdAndUserId(hackathonId, judgeId)).thenReturn(true);
		when(scoreRepository.findByIdeaIdAndJudgeIdAndCriterionId(ideaId, judgeId, criterionId))
				.thenReturn(Optional.empty());
		when(scoreRepository.save(any())).thenReturn(saved);

		JudgeScore result = submitScore.execute(hackathonId, ideaId, judgeId, criterionId, 8, "Good");
		assertThat(result.getScore()).isEqualTo(8);
	}

	@Test
	void submit_score_updates_existing_score() {
		UUID hackathonId = UUID.randomUUID();
		UUID ideaId = UUID.randomUUID();
		UUID judgeId = UUID.randomUUID();
		UUID criterionId = UUID.randomUUID();
		JudgeScore existing = new JudgeScore(hackathonId, ideaId, judgeId, criterionId, 5, "OK");
		var idea = mock(wtf.hackhub.domain.Idea.class);
		when(idea.getHackathonId()).thenReturn(hackathonId);
		when(ideaRepository.findById(ideaId)).thenReturn(Optional.of(idea));
		when(criteriaRepository.findById(criterionId))
				.thenReturn(Optional.of(new wtf.hackhub.domain.VotingCriteria(hackathonId, "Behavior", "", 70, 0)));

		when(judgeRepository.existsByHackathonIdAndUserId(hackathonId, judgeId)).thenReturn(true);
		when(scoreRepository.findByIdeaIdAndJudgeIdAndCriterionId(ideaId, judgeId, criterionId))
				.thenReturn(Optional.of(existing));
		when(scoreRepository.save(existing)).thenReturn(existing);

		submitScore.execute(hackathonId, ideaId, judgeId, criterionId, 9, "Excellent");
		assertThat(existing.getScore()).isEqualTo(9);
	}

	@Test
	void submit_score_throws_when_not_a_judge() {
		UUID hackathonId = UUID.randomUUID();
		UUID judgeId = UUID.randomUUID();
		when(judgeRepository.existsByHackathonIdAndUserId(hackathonId, judgeId)).thenReturn(false);

		assertThatThrownBy(() -> submitScore.execute(hackathonId, UUID.randomUUID(), judgeId, null, 7, null))
				.isInstanceOf(SubmitJudgeScoreUseCase.NotAJudgeException.class);
	}

	// ── UpdateHackathonJudgingConfigUseCase ───────────────────────────────────

	@Mock
	HackathonRepository hackathonRepository;

	@InjectMocks
	UpdateHackathonJudgingConfigUseCase updateConfig;

	@Test
	void update_judging_config_succeeds() {
		UUID hackathonId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));
		when(hackathonRepository.save(hackathon)).thenReturn(hackathon);

		Hackathon result = updateConfig.execute(hackathonId, Hackathon.Visibility.PUBLIC,
				Hackathon.JoinPolicy.INVITE_ONLY, Hackathon.JudgingMode.BLENDED, 70);

		assertThat(result.getVisibility()).isEqualTo(Hackathon.Visibility.PUBLIC);
		assertThat(result.getPanelWeight()).isEqualTo(70);
	}

	@Test
	void update_judging_config_invalid_weight_throws() {
		UUID hackathonId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));

		assertThatThrownBy(() -> updateConfig.execute(hackathonId, Hackathon.Visibility.PUBLIC,
				Hackathon.JoinPolicy.SELF_REGISTER, Hackathon.JudgingMode.PANEL, -1))
				.isInstanceOf(UpdateHackathonJudgingConfigUseCase.InvalidPanelWeightException.class);
	}

	@Test
	void update_judging_config_weight_over_100_throws() {
		UUID hackathonId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));

		assertThatThrownBy(() -> updateConfig.execute(hackathonId, Hackathon.Visibility.PUBLIC,
				Hackathon.JoinPolicy.SELF_REGISTER, Hackathon.JudgingMode.PANEL, 101))
				.isInstanceOf(UpdateHackathonJudgingConfigUseCase.InvalidPanelWeightException.class);
	}

	@Test
	void update_judging_config_not_found_throws() {
		UUID hackathonId = UUID.randomUUID();
		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> updateConfig.execute(hackathonId, null, null, null, 50))
				.isInstanceOf(UpdateHackathonJudgingConfigUseCase.HackathonNotFoundException.class);
	}

	@Test
	void execute_partial_uses_existing_values_when_null() {
		UUID hackathonId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));
		when(hackathonRepository.save(hackathon)).thenReturn(hackathon);

		updateConfig.executePartial(hackathonId, null, null, null, null);

		assertThat(hackathon.getVisibility()).isEqualTo(Hackathon.Visibility.PRIVATE);
		assertThat(hackathon.getPanelWeight()).isEqualTo(70);
	}

	// ── GetHackathonJudgesUseCase ─────────────────────────────────────────────

	@Mock
	ProfileRepository profileRepository;

	@InjectMocks
	GetHackathonJudgesUseCase getJudges;

	@Test
	void get_judges_returns_entries_with_profile() {
		UUID hackathonId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		UUID invitedBy = UUID.randomUUID();
		HackathonJudge judge = new HackathonJudge(hackathonId, userId, invitedBy);
		Profile profile = new Profile("judge@x.com", "Judge Joe", "hash");

		when(judgeRepository.findAllByHackathonId(hackathonId)).thenReturn(List.of(judge));
		when(profileRepository.findById(userId)).thenReturn(Optional.of(profile));

		List<GetHackathonJudgesUseCase.JudgeEntry> entries = getJudges.execute(hackathonId);

		assertThat(entries).hasSize(1);
		assertThat(entries.get(0).name()).isEqualTo("Judge Joe");
		assertThat(entries.get(0).email()).isEqualTo("judge@x.com");
	}

	@Test
	void get_judges_handles_missing_profile() {
		UUID hackathonId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		HackathonJudge judge = new HackathonJudge(hackathonId, userId, null);

		when(judgeRepository.findAllByHackathonId(hackathonId)).thenReturn(List.of(judge));
		when(profileRepository.findById(userId)).thenReturn(Optional.empty());

		List<GetHackathonJudgesUseCase.JudgeEntry> entries = getJudges.execute(hackathonId);

		assertThat(entries.get(0).name()).isNull();
		assertThat(entries.get(0).email()).isNull();
	}

	// ── SubmitFinalPresentationUseCase ────────────────────────────────────────

	@Mock
	FinalSubmissionRepository submissionRepository;
	@Mock
	TeamMemberRepository teamMemberRepository;
	@Mock
	TeamRepository teamRepository;

	@InjectMocks
	SubmitFinalPresentationUseCase submitFinal;

	@Test
	void submit_final_creates_new_submission() {
		UUID hackathonId = UUID.randomUUID();
		UUID teamId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		hackathon.open();
		hackathon.start();
		Team team = new Team("Alpha", "desc", hackathonId, userId);
		TeamMember leader = new TeamMember(teamId, userId, TeamMember.Role.LEADER);
		FinalSubmission saved = new FinalSubmission(hackathonId, teamId, null, "Title", "Desc", "[]", userId);

		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));
		when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
		when(teamMemberRepository.findByTeamIdAndUserId(teamId, userId)).thenReturn(Optional.of(leader));
		when(submissionRepository.findByHackathonIdAndTeamId(hackathonId, teamId)).thenReturn(Optional.empty());
		when(submissionRepository.save(any())).thenReturn(saved);

		FinalSubmission result = submitFinal.execute(hackathonId, teamId, userId, null, "Title", "Desc", "[]");
		assertThat(result.getTitle()).isEqualTo("Title");
	}

	@Test
	void submit_final_updates_existing_submission() {
		UUID hackathonId = UUID.randomUUID();
		UUID teamId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		hackathon.open();
		hackathon.start();
		Team team = new Team("Alpha", "desc", hackathonId, userId);
		TeamMember leader = new TeamMember(teamId, userId, TeamMember.Role.LEADER);
		FinalSubmission existing = new FinalSubmission(hackathonId, teamId, null, "Old", "Old", "[]", userId);

		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));
		when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
		when(teamMemberRepository.findByTeamIdAndUserId(teamId, userId)).thenReturn(Optional.of(leader));
		when(submissionRepository.findByHackathonIdAndTeamId(hackathonId, teamId)).thenReturn(Optional.of(existing));
		when(submissionRepository.save(existing)).thenReturn(existing);

		submitFinal.execute(hackathonId, teamId, userId, null, "New Title", "New desc", "[]");
		assertThat(existing.getTitle()).isEqualTo("New Title");
	}

	@Test
	void submit_final_throws_when_hackathon_not_running() {
		UUID hackathonId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);

		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));

		assertThatThrownBy(
				() -> submitFinal.execute(hackathonId, UUID.randomUUID(), UUID.randomUUID(), null, "T", "D", "[]"))
				.isInstanceOf(SubmitFinalPresentationUseCase.HackathonNotRunningException.class);
	}

	@Test
	void submit_final_throws_when_not_team_leader() {
		UUID hackathonId = UUID.randomUUID();
		UUID teamId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		hackathon.open();
		hackathon.start();
		Team team = new Team("Alpha", "desc", hackathonId, userId);
		TeamMember member = new TeamMember(teamId, userId, TeamMember.Role.MEMBER);

		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));
		when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
		when(teamMemberRepository.findByTeamIdAndUserId(teamId, userId)).thenReturn(Optional.of(member));

		assertThatThrownBy(() -> submitFinal.execute(hackathonId, teamId, userId, null, "T", "D", "[]"))
				.isInstanceOf(SubmitFinalPresentationUseCase.NotTeamLeaderException.class);
	}

	@Test
	void submit_final_throws_when_not_team_member() {
		UUID hackathonId = UUID.randomUUID();
		UUID teamId = UUID.randomUUID();
		UUID userId = UUID.randomUUID();
		Hackathon hackathon = new Hackathon("H", "D", Instant.now(), Instant.now().plusSeconds(86400), "KEY", 4, 100,
				UUID.randomUUID(), null);
		hackathon.open();
		hackathon.start();
		Team team = new Team("Alpha", "desc", hackathonId, userId);

		when(hackathonRepository.findById(hackathonId)).thenReturn(Optional.of(hackathon));
		when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
		when(teamMemberRepository.findByTeamIdAndUserId(teamId, userId)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> submitFinal.execute(hackathonId, teamId, userId, null, "T", "D", "[]"))
				.isInstanceOf(SubmitFinalPresentationUseCase.NotTeamMemberException.class);
	}
	@Test
	void an_assigned_judge_cannot_score_another_hods_approved_nomination() {
		UUID campaign = UUID.randomUUID(), ideaId = UUID.randomUUID(), judge = UUID.randomUUID();
		var idea = new wtf.hackhub.domain.Idea("Case", "Evidence", campaign, null, UUID.randomUUID(),
				"Customer Values");
		idea.update("Case", "Evidence", "Customer Values", List.of(), wtf.hackhub.domain.Idea.Status.SUBMITTED, null,
				null, null);
		idea.submitForApproval("owner-hod@example.test", "Owner HoD");
		idea.decideApproval("approved", "", "Owner HoD");
		when(judgeRepository.existsByHackathonIdAndUserId(campaign, judge)).thenReturn(true);
		when(ideaRepository.findById(ideaId)).thenReturn(Optional.of(idea));
		assertThatThrownBy(() -> submitScore.execute(campaign, ideaId, judge, null, 8, ""))
				.isInstanceOf(SubmitJudgeScoreUseCase.NotAJudgeException.class);
		verifyNoInteractions(scoreRepository);
	}

	@Test
	void grants_individual_scoring_only_to_the_submitting_employees_hod() {
		UUID award = UUID.randomUUID(), ideaId = UUID.randomUUID(), ownerHod = UUID.randomUUID(),
				otherHod = UUID.randomUUID(), criterionId = UUID.randomUUID();
		var idea = new wtf.hackhub.domain.Idea("Individual", "Evidence", award, null, UUID.randomUUID(),
				"Customer Values");
		idea.update("Individual", "Evidence", "Customer Values", List.of(), wtf.hackhub.domain.Idea.Status.SUBMITTED,
				null, null, "[{\"type\":\"nomination\",\"coreTeamMembers\":\"Extra Member\"}]");
		idea.submitForApproval("owner-hod@example.test", "Owner HoD");
		idea.decideApproval("approved", "", "Owner HoD");
		when(ideaRepository.findById(ideaId)).thenReturn(Optional.of(idea));
		when(approvalDirectory.reviewerKey(otherHod)).thenReturn(Optional.of("other-hod@example.test"));
		when(approvalDirectory.reviewerKey(ownerHod)).thenReturn(Optional.of("owner-hod@example.test"));
		var criterion = new wtf.hackhub.domain.VotingCriteria(award, "Behavior", "", 70, 0);
		org.springframework.test.util.ReflectionTestUtils.setField(criterion, "id", criterionId);
		when(criteriaRepository.findAllByHackathonIdOrderByDisplayOrder(award)).thenReturn(List.of(criterion));
		var scores = List.of(new SubmitJudgeScoreUseCase.CriterionScore(criterionId, 8));
		assertThatThrownBy(() -> submitScore.submitEvaluation(award, ideaId, otherHod, scores, "Wrong HoD"))
				.isInstanceOf(SubmitJudgeScoreUseCase.NotAJudgeException.class);
		assertThatThrownBy(() -> submitScore.deleteEvaluation(award, ideaId, otherHod))
				.isInstanceOf(SubmitJudgeScoreUseCase.NotAJudgeException.class);
		verifyNoInteractions(scoreRepository);
		when(scoreRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
		assertThat(submitScore.submitEvaluation(award, ideaId, ownerHod, scores, "Correct HoD")).hasSize(1);
		verify(approvalDirectory, never()).memberHeadKey(anyString());
	}

	@Test
	void team_access_combines_and_deduplicates_submitter_and_core_members_hods() {
		UUID award = UUID.randomUUID(), ideaId = UUID.randomUUID(), coreHod = UUID.randomUUID();
		var idea = new wtf.hackhub.domain.Idea("Team", "Evidence", award, UUID.randomUUID(), UUID.randomUUID(),
				"Customer Values");
		idea.update("Team", "Evidence", "Customer Values", List.of(), wtf.hackhub.domain.Idea.Status.SUBMITTED, null,
				null,
				"""
						[{"type":"nomination","nominationType":"team","coreTeamMembers":"A Member;B Member;A Member;Unknown"}]
						""");
		idea.submitForApproval("OWNER-HOD@example.test", "Owner HoD");
		idea.decideApproval("approved", "", "Owner HoD");
		org.springframework.test.util.ReflectionTestUtils.setField(idea, "id", ideaId);
		when(approvalDirectory.memberHeadKey("A Member")).thenReturn(Optional.of("owner-hod@example.test"));
		when(approvalDirectory.memberHeadKey("B Member")).thenReturn(Optional.of("core-hod@example.test"));
		when(approvalDirectory.reviewerKey(coreHod)).thenReturn(Optional.of("core-hod@example.test"));
		when(ideaRepository.findAllByHackathonId(award)).thenReturn(List.of(idea));
		assertThat(submitScore.scoringHeadKeys(idea)).containsExactlyInAnyOrder("owner-hod@example.test",
				"core-hod@example.test");
		assertThat(submitScore.eligibleNominations(award, coreHod)).containsExactly(ideaId);
	}

	@Test
	void rejects_case_from_another_award() {
		UUID award = UUID.randomUUID(), ideaId = UUID.randomUUID(), judge = UUID.randomUUID();
		when(judgeRepository.existsByHackathonIdAndUserId(award, judge)).thenReturn(true);
		var idea = mock(wtf.hackhub.domain.Idea.class);
		when(idea.getHackathonId()).thenReturn(UUID.randomUUID());
		when(ideaRepository.findById(ideaId)).thenReturn(Optional.of(idea));
		assertThatThrownBy(() -> submitScore.execute(award, ideaId, judge, null, 8, ""))
				.isInstanceOf(IllegalArgumentException.class);
		verifyNoInteractions(scoreRepository);
	}

	@Test
	void rejects_incomplete_atomic_evaluation_without_writing_scores() {
		UUID award = UUID.randomUUID(), judge = UUID.randomUUID(), criterion = UUID.randomUUID(),
				ideaId = UUID.randomUUID();
		when(judgeRepository.existsByHackathonIdAndUserId(award, judge)).thenReturn(true);
		when(ideaRepository.findById(ideaId)).thenReturn(Optional.of(
				new wtf.hackhub.domain.Idea("Case", "Evidence", award, null, UUID.randomUUID(), "Customer Values")));
		when(criteriaRepository.findAllByHackathonIdOrderByDisplayOrder(award)).thenReturn(List.of());
		assertThatThrownBy(() -> submitScore.submitEvaluation(award, ideaId, judge,
				List.of(new SubmitJudgeScoreUseCase.CriterionScore(criterion, 8)), "Evidence"))
				.isInstanceOf(IllegalArgumentException.class);
		verifyNoInteractions(scoreRepository);
	}

}
