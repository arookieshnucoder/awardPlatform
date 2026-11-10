package wtf.hackhub.application.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import wtf.hackhub.domain.Profile;
import wtf.hackhub.infrastructure.persistence.auth.ProfileRepository;
import wtf.hackhub.support.PostgresIntegrationTest;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class SsoIdentityIT extends PostgresIntegrationTest {

	@Autowired
	ProfileRepository profiles;
	@Autowired
	LoginUseCase login;
	@Autowired
	RefreshTokenUseCase refresh;
	@Autowired
	PlatformTransactionManager transactions;
	private final UUID tenant = UUID.randomUUID();
	private final UUID object = UUID.randomUUID();

	private LoginUseCase.TokenPair signIn(String email) {
		return new TransactionTemplate(transactions).execute(
				status -> new SsoLoginUseCase(jdbc, profiles, login).execute(tenant, object, email, "Employee"));
	}

	@Test
	void provisionsOnceAndRestoresSameProfileWithRotatingSession() {
		var first = signIn("Employee@example.invalid");
		assertThat(first.profile().getRole()).isEqualTo(Profile.Role.PARTICIPANT);
		assertThat(first.profile().getPasswordHash()).isNull();
		assertThat(first.profile().getEmail()).isEqualTo("employee@example.invalid");
		var second = signIn("changed-address@example.invalid");
		assertThat(second.profile().getId()).isEqualTo(first.profile().getId());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM sso_identities", Long.class)).isEqualTo(1);
		assertThat(refresh.execute(second.refreshToken()).profile().getId()).isEqualTo(first.profile().getId());
		assertThatThrownBy(() -> login.execute("employee@example.invalid", "any-password"))
				.isInstanceOf(LoginUseCase.InvalidCredentialsException.class);
	}

	@Test
	void doesNotTakeOverAnExistingEmailEvenWhenCaseDiffers() {
		String id = insertProfile("Employee@example.invalid", "Original", "admin");
		assertThatThrownBy(() -> signIn("employee@example.invalid")).isInstanceOf(OAuth2AuthenticationException.class);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM sso_identities", Long.class)).isZero();
		assertThat(profiles.findById(UUID.fromString(id)).orElseThrow().getRole()).isEqualTo(Profile.Role.ADMIN);
	}

	@Test
	void explicitBindingPreservesProfileAndCannotBeDuplicated() {
		String id = insertProfile("original@example.invalid", "Original", "manager");
		jdbc.update("INSERT INTO sso_identities (tenant_id, object_id, profile_id) VALUES (?, ?, ?)", tenant, object,
				UUID.fromString(id));
		var signedIn = signIn("changed@example.invalid");
		assertThat(signedIn.profile().getId()).isEqualTo(UUID.fromString(id));
		assertThat(signedIn.profile().getRole()).isEqualTo(Profile.Role.MANAGER);
		assertThatThrownBy(
				() -> jdbc.update("INSERT INTO sso_identities (tenant_id, object_id, profile_id) VALUES (?, ?, ?)",
						tenant, UUID.randomUUID(), UUID.fromString(id)))
				.isInstanceOf(DataIntegrityViolationException.class);
		jdbc.update("DELETE FROM profiles WHERE id = ?", UUID.fromString(id));
		assertThat(jdbc.queryForObject("SELECT count(*) FROM sso_identities", Long.class)).isZero();
	}
}
