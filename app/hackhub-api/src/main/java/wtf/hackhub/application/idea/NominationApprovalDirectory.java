package wtf.hackhub.application.idea;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.text.Normalizer;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Matches the supplied employee roster against claims saved only during
 * verified SSO login.
 */
@Service
public class NominationApprovalDirectory {
	public record Employee(String email, String nt, String name, String orgUnit, String nominatingHead, String hodNt,
			String hodEmail, boolean allowSelfApproval) {
	}
	private final JdbcTemplate jdbc;
	private final List<Employee> employees;
	private final Map<String, List<Employee>> byMemberName = new HashMap<>();
	public NominationApprovalDirectory(JdbcTemplate jdbc, ObjectMapper mapper) throws IOException {
		this.jdbc = jdbc;
		try (var input = new ClassPathResource("nomination-roster.json").getInputStream()) {
			employees = mapper.readValue(input, new TypeReference<List<Employee>>() {
			});
		}
		for (var employee : employees) {
			if (employee.name() == null || employee.name().isBlank())
				continue;
			Arrays.stream(employee.name().split("/")).map(NominationApprovalDirectory::memberNameKey)
					.filter(key -> !key.isBlank()).distinct().forEach(key -> byMemberName
							.computeIfAbsent(key, ignored -> new java.util.ArrayList<>()).add(employee));
		}
	}
	public Optional<String> verifiedEmail(UUID profileId) {
		var matches = jdbc.query(
				"SELECT DISTINCT lower(verified_email) FROM sso_identities WHERE profile_id = ? AND verified_email IS NOT NULL",
				(rs, row) -> rs.getString(1), profileId);
		return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
	}
	public Optional<Employee> employee(UUID profileId) {
		return verifiedEmail(profileId).flatMap(email -> {
			var matches = employees.stream().filter(e -> email.equalsIgnoreCase(e.email())).toList();
			return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
		});
	}
	public Optional<String> reviewerKey(UUID profileId) {
		return verifiedEmail(profileId).filter(email -> employees.stream()
				.anyMatch(e -> e.hodEmail() != null && email.equalsIgnoreCase(e.hodEmail())));
	}
	public Employee requireEmployee(UUID profileId) {
		var employee = employee(profileId).orElseThrow(() -> new IllegalArgumentException(
				"Sign in with Bosch SSO using an email listed in the employee roster before submitting."));
		if (employee.hodEmail() == null || employee.hodEmail().isBlank())
			throw new IllegalArgumentException(
					"The roster does not provide a verified email for your Nominating HoD. Contact an administrator.");
		if (employee.email().equalsIgnoreCase(employee.hodEmail()) && !employee.allowSelfApproval())
			throw new IllegalArgumentException(
					"Your Nominating HoD cannot approve their own nomination. Contact an administrator.");
		return employee;
	}
	public boolean allowsSelfApproval(UUID profileId) {
		return employee(profileId).filter(Employee::allowSelfApproval)
				.filter(e -> e.hodEmail() != null && e.email().equalsIgnoreCase(e.hodEmail())).isPresent();
	}
	public String headKey(Employee employee) {
		return employee.hodEmail().toLowerCase(Locale.ROOT);
	}

	/**
	 * Matches a stored Core Team Member entry only when the roster identifies that
	 * employee uniquely.
	 */
	public Optional<String> memberHeadKey(String entry) {
		var matches = byMemberName.getOrDefault(memberNameKey(entry), List.of());
		int suffix = entry.lastIndexOf(" (");
		if (matches.isEmpty() && suffix >= 0 && entry.endsWith(")")) {
			String department = entry.substring(suffix + 2, entry.length() - 1).strip();
			matches = byMemberName.getOrDefault(memberNameKey(entry.substring(0, suffix)), List.of()).stream()
					.filter(employee -> department.equalsIgnoreCase(employee.orgUnit())).toList();
		}
		return matches.size() == 1
				? Optional.ofNullable(matches.getFirst().hodEmail()).filter(email -> !email.isBlank())
						.map(email -> email.strip().toLowerCase(Locale.ROOT))
				: Optional.empty();
	}

	public static String memberNameKey(String value) {
		String normalized = Normalizer.normalize(value, Normalizer.Form.NFKD).replaceAll("\\p{M}+", "").strip()
				.toLowerCase(Locale.ROOT).replaceFirst("^(mr|ms|mrs|dr)[.\\s]+", "");
		return Arrays.stream(normalized.split("[^\\p{L}\\p{N}]+")).filter(token -> !token.isEmpty()).sorted()
				.collect(Collectors.joining(" "));
	}
}
