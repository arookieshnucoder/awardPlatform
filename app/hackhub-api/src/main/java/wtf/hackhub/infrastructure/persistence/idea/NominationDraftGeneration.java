package wtf.hackhub.infrastructure.persistence.idea;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NominationDraftGeneration {
	private final JdbcTemplate jdbc;

	public NominationDraftGeneration(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public int current() {
		return jdbc.queryForObject("SELECT generation FROM nomination_draft_state WHERE singleton", Integer.class);
	}

	public int advance() {
		return jdbc.queryForObject(
				"UPDATE nomination_draft_state SET generation = generation + 1 WHERE singleton RETURNING generation",
				Integer.class);
	}
}
