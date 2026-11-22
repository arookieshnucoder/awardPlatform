package wtf.hackhub.application.idea;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.InputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NominationApprovalDirectoryTest {
	@Test
	void resolves_only_unique_members_or_the_member_in_the_selected_department() throws Exception {
		var mapper = mock(ObjectMapper.class);
		when(mapper.readValue(any(InputStream.class),
				ArgumentMatchers.<TypeReference<List<NominationApprovalDirectory.Employee>>>any())).thenReturn(
						List.of(employee("alex-it@example.test", "Mr. 张甲/ALEX Zhang", "BD/IT", "IT-HOD@example.test"),
								employee("alex-hr@example.test", "Mr. 张乙/Zhang Alex", "BD/HR", "hr-hod@example.test"),
								employee("sam@example.test", "Ms. 李甲/Sam Li", "BD/IT", "IT-HOD@example.test")));
		var directory = new NominationApprovalDirectory(mock(JdbcTemplate.class), mapper);

		assertThat(directory.memberHeadKey("Zhang Alex")).isEmpty();
		assertThat(directory.memberHeadKey("Alex Zhang (BD/HR)")).contains("hr-hod@example.test");
		assertThat(directory.memberHeadKey("张甲")).contains("it-hod@example.test");
		assertThat(directory.memberHeadKey("Li Sam")).contains("it-hod@example.test");
		assertThat(directory.memberHeadKey("Alex Zhang (BD/OTHER)")).isEmpty();
		assertThat(directory.memberHeadKey("Sam")).isEmpty();
	}

	private static NominationApprovalDirectory.Employee employee(String email, String name, String org, String head) {
		return new NominationApprovalDirectory.Employee(email, "", name, org, "", "", head, false);
	}
}
