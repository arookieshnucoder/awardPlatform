package wtf.hackhub.application.idea;

import org.junit.jupiter.api.Test;
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
