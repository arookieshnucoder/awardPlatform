package wtf.hackhub.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestCustomizers;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import java.net.URI;

public class SsoAuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {

	public static final String BASE_URI = "/api/v1/auth/oidc/authorize";
	public static final String RETURN_TO = SsoAuthorizationRequestResolver.class.getName() + ".returnTo";
	private final DefaultOAuth2AuthorizationRequestResolver delegate;

	public SsoAuthorizationRequestResolver(ClientRegistrationRepository clients) {
		delegate = new DefaultOAuth2AuthorizationRequestResolver(clients, BASE_URI);
		delegate.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
	}

	@Override
	public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
		return rememberDestination(request, delegate.resolve(request));
	}

	@Override
	public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String registrationId) {
		return rememberDestination(request, delegate.resolve(request, registrationId));
	}

	private OAuth2AuthorizationRequest rememberDestination(HttpServletRequest request,
			OAuth2AuthorizationRequest authorization) {
		if (authorization != null) {
			var session = request.getSession(true);
			session.setMaxInactiveInterval(300);
			session.setAttribute(RETURN_TO, safeDestination(request.getParameter("redirect")));
		}
		return authorization;
	}

	public static String safeDestination(String requested) {
		if (requested == null || requested.length() > 2048 || !requested.startsWith("/") || requested.startsWith("//")
				|| requested.matches(".*[\\\\\\s\\p{Cntrl}%].*")) {
			return "/overview";
		}
		try {
			var uri = URI.create(requested).normalize();
			String path = uri.getPath().replaceAll("/+$", "");
			if (uri.getHost() != null || path.isEmpty() || path.equals("/login") || path.equals("/register")
					|| path.startsWith("/api/")) {
				return "/overview";
			}
			return uri.toString();
		} catch (IllegalArgumentException ex) {
			return "/overview";
		}
	}
}
