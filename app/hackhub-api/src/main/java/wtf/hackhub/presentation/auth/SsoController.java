package wtf.hackhub.presentation.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SsoController {

	private final boolean enabled;

	public SsoController(@Value("${app.sso.enabled:false}") boolean enabled) {
		this.enabled = enabled;
	}

	@GetMapping("/api/v1/auth/sso")
	public ResponseEntity<Options> options() {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Options(enabled));
	}

	public record Options(boolean enabled) {
	}
}
