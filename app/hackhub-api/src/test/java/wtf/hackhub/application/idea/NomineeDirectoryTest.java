package wtf.hackhub.application.idea;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import wtf.hackhub.domain.*;
import wtf.hackhub.infrastructure.persistence.auth.ProfileRepository;
import wtf.hackhub.infrastructure.persistence.idea.VotingParticipantRepository;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class NomineeDirectoryTest {
	ProfileRepository profiles = mock(ProfileRepository.class);
	VotingParticipantRepository participants = mock(VotingParticipantRepository.class);
	NomineeDirectory directory = new NomineeDirectory(profiles, participants);

	@Test
	void resolves_showcase_names_in_one_lookup_for_legacy_and_approved_nominations() {
		var legacy = mock(Idea.class);
		var approved = mock(Idea.class);
		var creatorId = UUID.randomUUID();
		var nomineeId = UUID.randomUUID();
		var legacyId = UUID.randomUUID();
		var approvedId = UUID.randomUUID();
		when(legacy.getId()).thenReturn(legacyId);
		when(legacy.getCreatedBy()).thenReturn(creatorId);
		when(approved.getId()).thenReturn(approvedId);
		when(approved.getApprovalStatus()).thenReturn("approved");
		when(approved.getProjectAttachments()).thenReturn(
				"[{\"type\":\"nomination\",\"nomineeUserId\":\"" + nomineeId + "\"}]");
		var creator = new Profile("fixed-term.Alex.WANG@example.test", "Display Name", "hash");
		var nominee = new Profile("xiao.ming2@example.test", "Another Name", "hash");
		ReflectionTestUtils.setField(creator, "id", creatorId);
		ReflectionTestUtils.setField(nominee, "id", nomineeId);
		when(profiles.findAllById(Set.of(creatorId, nomineeId))).thenReturn(List.of(creator, nominee));

		assertThat(directory.showcaseNames(List.of(legacy, approved)))
				.containsExactlyInAnyOrderEntriesOf(Map.of(legacyId, "Alex WANG", approvedId, "xiao ming"));
		verify(profiles).findAllById(Set.of(creatorId, nomineeId));
		verifyNoMoreInteractions(profiles);
	}
	@Test
	void roster_lookup_does_not_use_the_profiles_org_code_as_membership() {
		Profile profile = new Profile("outsider@bosch.com", "Outside Employee", "hash");
		profile.syncSsoDepartment("BD/DPA-SRE3");
		assertThat(directory.resolveRosterParticipant(profile)).isEmpty();
		assertThat(directory.resolveParticipant(profile)).isPresent();
	}

	@Test
	void roster_lookup_supports_fixed_term_email_and_name_fallback() {
		var entry = new VotingParticipant("1", "BD/DPA-SRE3", "Alice Wang", "alicewang");
		when(participants.findAllByNormalizedName("alicewang")).thenReturn(List.of(entry));
		assertThat(directory
				.resolveRosterParticipant(new Profile("fixed-term.Alice.Wang@cn.bosch.com", "Changed Name", "hash")))
				.contains(entry);
		assertThat(directory.resolveRosterParticipant(new Profile("employee123@bosch.com", "Ms. Alice Wang", "hash")))
				.contains(entry);
	}

	@Test
	void roster_lookup_rejects_ambiguous_names_even_with_an_org_code() {
		Profile profile = new Profile("alice@bosch.com", "Alice", "hash");
		profile.syncSsoDepartment("BD/DPA-SRE3");
		when(participants.findAllByNormalizedName("alice"))
				.thenReturn(List.of(new VotingParticipant("1", "BD/DPA", "Alice", "alice"),
						new VotingParticipant("2", "BD/BA", "Alice", "alice")));
		assertThat(directory.resolveRosterParticipant(profile)).isEmpty();
	}

	@Test
	void resolves_email_before_an_edited_display_name() {
		Profile profile = new Profile("alice.wang@bosch.com", "Other Person", "hash");
		when(participants.findAllByNormalizedName("alicewang"))
				.thenReturn(List.of(new VotingParticipant("1", "BD/DPA-SRE3", "Alice", "alicewang")));
		assertThat(directory.resolveParticipant(profile)).isPresent().get()
				.extracting(VotingParticipant::getOrganizationalUnit).isEqualTo("BD/DPA-SRE3");
		verify(participants, never()).findAllByNormalizedName("otherperson");
	}
	@Test
	void persists_authoritative_name_and_org_and_keeps_storage_key() {
		UUID id = UUID.randomUUID();
		when(profiles.findById(id)).thenReturn(Optional.of(new Profile("alice@bosch.com", "Alice", "hash")));
		when(participants.findAllByNormalizedName("alice"))
				.thenReturn(List.of(new VotingParticipant("1", "BD/DPA-SRE3", "Alice", "alice")));
		String enriched = directory.enrich("[{\"type\":\"nomination\",\"nomineeUserId\":\"" + id
				+ "\",\"name\":\"Fake\",\"orgCode\":\"FAKE\",\"nomineeOrgCode\":\"FAKE\"},{\"type\":\"screenshot\",\"storageKey\":\"photos/key.png\"}]",
				true);
		assertThat(enriched).contains("BD/DPA-SRE3", "Alice", "photos/key.png").doesNotContain("FAKE", "Fake",
				"\"orgCode\"");
	}
	@Test
	void cannot_submit_missing_or_ambiguous_department() {
		UUID id = UUID.randomUUID();
		when(profiles.findById(id)).thenReturn(Optional.of(new Profile("alice@bosch.com", "Alice", "hash")));
		String input = "[{\"type\":\"nomination\",\"nomineeUserId\":\"" + id + "\",\"nomineeOrgCode\":\"FORGED\"}]";
		assertThatThrownBy(() -> directory.enrich(input, true)).isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("roster");
		assertThat(directory.enrich(input, false)).doesNotContain("FORGED");
		when(participants.findAllByNormalizedName("alice"))
				.thenReturn(List.of(new VotingParticipant("1", "BD/DPA-SRE3", "Alice", "alice"),
						new VotingParticipant("2", "BD/BA-AP", "Alice", "alice")));
		assertThatThrownBy(() -> directory.enrich(input, true)).isInstanceOf(IllegalArgumentException.class);
	}
	@Test
	void confirmed_hrl_department_does_not_grant_admin_permissions() {
		Profile profile = new Profile("fixed-term.Yiheng.LU@cn.bosch.com", "Yiheng.LU", "hash");
		org.springframework.test.util.ReflectionTestUtils.setField(profile, "orgCode", "HRL");
		assertThat(directory.resolveParticipant(profile)).isPresent().get()
				.extracting(VotingParticipant::getOrganizationalUnit).isEqualTo("HRL");
		assertThat(profile.getRole()).isEqualTo(Profile.Role.PARTICIPANT);
		verifyNoInteractions(participants);
	}
}
