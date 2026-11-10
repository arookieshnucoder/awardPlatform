package wtf.hackhub.infrastructure.security;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SsoAuthorizationRequestResolverTest {

	@ParameterizedTest
	@NullSource
	@ValueSource(strings = {"", "/", "//example.invalid", "https://example.invalid", "/\\example.invalid",
			"/%2fexample.invalid", "/login", "/overview/../login", "/register/", "/api/v1/auth/logout",
			"/\n//example.invalid"})
	void rejectsUnsafeDestinations(String destination) {
		assertEquals("/overview", SsoAuthorizationRequestResolver.safeDestination(destination));
	}

	@ParameterizedTest
	@ValueSource(strings = {"/nominate", "/projects?tab=mine", "/awards/123#review"})
	void preservesInternalDestination(String destination) {
		assertEquals(destination, SsoAuthorizationRequestResolver.safeDestination(destination));
	}
}
