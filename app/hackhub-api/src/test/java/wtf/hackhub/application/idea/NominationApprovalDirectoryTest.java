package wtf.hackhub.application.idea;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NominationApprovalDirectoryTest {
	@Test
	void only_vinods_verified_email_resolves_to_the_existing_approval_key() throws IOException {
		var jdbc = mock(JdbcTemplate.class);
		var vinodProfile = UUID.randomUUID();
		var otherProfile = UUID.randomUUID();
		when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<String>>any(), eq(vinodProfile)))
				.thenReturn(List.of("vinod.a@in.bosch.com"));
		when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<String>>any(), eq(otherProfile)))
				.thenReturn(List.of("vio2kor@bosch.com"));
		var directory = new NominationApprovalDirectory(jdbc, new ObjectMapper());

		assertThat(directory.nominationReviewerKey(vinodProfile)).contains("vio2kor@bosch.com");
		assertThat(directory.nominationReviewerKey(otherProfile)).isEmpty();
		assertThat(directory.reviewerKey(vinodProfile)).isEmpty();
	}

	@Test
	void normalizes_member_names_for_team_search() {
		assertThat(NominationApprovalDirectory.memberNameKey("Mr. ZHANG Àlex"))
				.isEqualTo(NominationApprovalDirectory.memberNameKey("Alex Zhang"));
		assertThat(NominationApprovalDirectory.memberNameKey("Ms. 张甲")).isEqualTo("张甲");
	}
}
