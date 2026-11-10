package wtf.hackhub.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Serializes case identity changes, ballots, and evaluations within their transaction. */
@Component
public class IdeaMutationLock {
	private final JdbcTemplate jdbc;

	public IdeaMutationLock(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public void acquire(UUID ideaId) {
		// Advisory locks do not require UPDATE access to the case under RLS.
		// All callers acquire the case lock before any voter/profile lock.
		long key = ideaId.getMostSignificantBits() ^ ideaId.getLeastSignificantBits();
		jdbc.query("SELECT pg_advisory_xact_lock(?)", rs -> {}, key);
	}
}
