package wtf.hackhub.infrastructure.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

class SsoPropertiesTest {

	private static final String ID = "11111111-1111-1111-1111-111111111111";

	@Test
	void acceptsOnlyExplicitTenantAndHttpsOrigin() {
		var properties = new SsoProperties(ID, ID, "test-only", "https://portal.example.invalid");
		assertDoesNotThrow(properties::validate);
		assertEquals("https://login.microsoftonline.com/" + ID + "/v2.0", properties.issuer());
		assertFalse(properties.toString().contains("test-only"));
	}

	@ParameterizedTest
	@ValueSource(strings = {"http://portal.example.invalid", "https://portal.example.invalid/",
			"https://portal.example.invalid/path", "https://portal.example.invalid?next=x",
			"https://portal.example.invalid#x", "https://user@portal.example.invalid", ""})
	void rejectsUnsafePublicUrl(String url) {
		assertThrows(IllegalArgumentException.class, () -> new SsoProperties(ID, ID, "test-only", url).validate());
	}

	@ParameterizedTest
	@ValueSource(strings = {"common", "organizations", "", "not-a-tenant"})
	void rejectsNonTenantSpecificIssuer(String tenant) {
		assertThrows(IllegalArgumentException.class,
				() -> new SsoProperties(tenant, ID, "test-only", "https://portal.example.invalid").validate());
	}

	@Test
	void requiresSecretWhenEnabled() {
		assertThrows(IllegalArgumentException.class,
				() -> new SsoProperties(ID, ID, "", "https://portal.example.invalid").validate());
	}
}
