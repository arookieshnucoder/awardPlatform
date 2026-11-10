package wtf.hackhub.presentation.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import wtf.hackhub.infrastructure.config.SecurityConfig;
import wtf.hackhub.infrastructure.security.JwtAuthFilter;
import wtf.hackhub.infrastructure.security.JwtProvider;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SsoController.class)
@Import({SecurityConfig.class, JwtAuthFilter.class})
class SsoDisabledTest {

	@Autowired
	MockMvc mvc;
	@MockBean
	JwtProvider jwt;

	@Test
	void requiresNoProviderConfigurationWhenDisabled() throws Exception {
		mvc.perform(get("/api/v1/auth/sso")).andExpect(status().isOk())
				.andExpect(content().json("{\"enabled\":false}", true));
		mvc.perform(get("/api/v1/auth/oidc/authorize/bosch")).andExpect(status().isUnauthorized());
	}
}
