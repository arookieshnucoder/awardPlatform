package wtf.hackhub.application.idea;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import wtf.hackhub.domain.Profile;
import wtf.hackhub.domain.VotingParticipant;
import wtf.hackhub.infrastructure.persistence.IdeaMutationLock;
import wtf.hackhub.infrastructure.persistence.auth.ProfileRepository;
import wtf.hackhub.infrastructure.persistence.idea.IdeaRepository;
import wtf.hackhub.infrastructure.persistence.idea.VotingParticipantRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NominationApprovalServiceTest {

	private final UUID userId = UUID.randomUUID();
	private final Profile profile = new Profile("alex.wang@example.test", "Alex", "hash");
	private final ProfileRepository profiles = mock(ProfileRepository.class);
	private final VotingParticipantRepository roster = mock(VotingParticipantRepository.class);
	private final NominationApprovalDirectory approvals = mock(NominationApprovalDirectory.class);
	private final NominationApprovalService service = new NominationApprovalService(approvals,
			mock(IdeaRepository.class), profiles, mock(IdeaMutationLock.class), mock(JdbcTemplate.class),
			new NomineeDirectory(profiles, roster));

	@Test
	void outside_roster_manager_cannot_nominate_but_keeps_assigned_review_access() {
		profile.changeRole(Profile.Role.MANAGER);
		profile.syncSsoDepartment("BD/DPA");
		when(profiles.findById(userId)).thenReturn(Optional.of(profile));
		when(approvals.reviewerKey(userId)).thenReturn(Optional.of("hod@example.test"));

		assertThat(service.eligibility(userId)).isEqualTo(new NominationApprovalService.Eligibility(
				false, true, null, NominationApprovalService.BD_NOMINATION_MESSAGE, false));
	}

	@Test
	void roster_member_can_open_form_and_existing_hod_requirements_still_apply() {
		when(profiles.findById(userId)).thenReturn(Optional.of(profile));
		when(roster.findAllByNormalizedName("alexwang"))
				.thenReturn(List.of(new VotingParticipant("1", "BD/DPA", "Alex Wang", "alexwang")));
		when(approvals.requireEmployee(userId)).thenThrow(new IllegalArgumentException("Missing HoD"));

		assertThat(service.eligibility(userId)).isEqualTo(new NominationApprovalService.Eligibility(
				false, false, null, "Missing HoD", true));
	}

	@Test
	void admin_needs_roster_membership_for_submission_but_can_open_review() {
		profile.changeRole(Profile.Role.ADMIN);
		when(profiles.findById(userId)).thenReturn(Optional.of(profile));

		assertThat(service.eligibility(userId)).isEqualTo(new NominationApprovalService.Eligibility(
				false, true, null, NominationApprovalService.BD_NOMINATION_MESSAGE, false));
		when(roster.findAllByNormalizedName("alexwang"))
				.thenReturn(List.of(new VotingParticipant("1", "BD/DPA", "Alex Wang", "alexwang")));
		assertThat(service.eligibility(userId)).isEqualTo(new NominationApprovalService.Eligibility(
				true, true, profile.getName(), null, true));
	}
}
