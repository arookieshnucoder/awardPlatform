package wtf.hackhub.application.idea;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class NominationApprovalDirectoryTest {
	@Test
	void normalizes_member_names_for_team_search() {
		assertThat(NominationApprovalDirectory.memberNameKey("Mr. ZHANG Àlex"))
				.isEqualTo(NominationApprovalDirectory.memberNameKey("Alex Zhang"));
		assertThat(NominationApprovalDirectory.memberNameKey("Ms. 张甲")).isEqualTo("张甲");
	}
}
