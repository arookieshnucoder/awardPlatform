package wtf.hackhub.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
@ConfigurationProperties("app.sso")
public record SsoProperties(String tenantId, String clientId, String clientSecret, String publicBaseUrl) {

	public void validate() {
		if (!isUuid(tenantId) || !isUuid(clientId)) {
			throw new IllegalArgumentException("SSO requires a tenant UUID and an application client UUID");
		}
		if (clientSecret == null || clientSecret.isBlank()) {
			throw new IllegalArgumentException("SSO requires a server-side client secret");
		}
		URI base;
		try {
			base = URI.create(publicBaseUrl == null ? "" : publicBaseUrl);
		} catch (IllegalArgumentException ex) {
			throw new IllegalArgumentException("SSO public base URL must be an HTTPS origin");
		}
		if (!"https".equals(base.getScheme()) || base.getHost() == null || base.getRawUserInfo() != null
				|| base.getRawQuery() != null || base.getRawFragment() != null
				|| (base.getRawPath() != null && !base.getRawPath().isEmpty())) {
			throw new IllegalArgumentException("SSO public base URL must be an HTTPS origin without a trailing slash");
		}
	}

	public String issuer() {
		return "https://login.microsoftonline.com/" + tenantId + "/v2.0";
	}

	private static boolean isUuid(String value) {
		return value != null && value.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
	}

	@Override
	public String toString() {
		return "SsoProperties[redacted]";
	}
}
