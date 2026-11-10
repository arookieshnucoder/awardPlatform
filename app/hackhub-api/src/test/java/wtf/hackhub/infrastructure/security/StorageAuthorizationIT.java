package wtf.hackhub.infrastructure.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import wtf.hackhub.infrastructure.persistence.idea.IdeaRepository;
import wtf.hackhub.support.PostgresIntegrationTest;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class StorageAuthorizationIT extends PostgresIntegrationTest {
	@Autowired
	StorageSecurityService security;
	@Autowired
	IdeaRepository ideas;

	@Test
	void exact_published_attachment_is_visible_and_draft_or_unreferenced_files_are_not() {
		UUID owner = UUID.fromString(insertProfile("owner@test.com", "Owner", "manager"));
		UUID reader = UUID.fromString(insertProfile("reader@test.com", "Reader", "participant"));
		UUID campaign = jdbc.queryForObject(
				"INSERT INTO hackathons(title,description,start_date,end_date,created_by,registration_key,allowed_participants) VALUES ('Award','Evidence',now(),now()+interval '1 day',?,gen_random_uuid()::text,100) RETURNING id",
				UUID.class, owner);
		String key = "nominations/" + campaign + "/" + owner + "/photo.png";
		UUID idea = jdbc.queryForObject(
				"INSERT INTO ideas(title,description,hackathon_id,created_by,category,status,project_attachments) VALUES ('Nominee','Impact',?,?,'Customer Values','submitted',?::jsonb) RETURNING id",
				UUID.class, campaign, owner, "[{\"storageKey\":\"" + key + "\"}]");
		var auth = new UsernamePasswordAuthenticationToken(reader, null,
				List.of(new SimpleGrantedAuthority("ROLE_PARTICIPANT")));
		assertThat(ideas.findByAttachmentKey(key)).hasSize(1);
		assertThatCode(() -> security.requireAccess("project-attachments", key, false, auth))
				.doesNotThrowAnyException();
		assertThatThrownBy(() -> security.requireAccess("project-attachments", key.replace("photo.png", "private.png"),
				false, auth)).isInstanceOf(AccessDeniedException.class);
		jdbc.update("UPDATE ideas SET status='draft' WHERE id=?", idea);
		assertThatThrownBy(() -> security.requireAccess("project-attachments", key, false, auth))
				.isInstanceOf(AccessDeniedException.class);
		jdbc.update("UPDATE ideas SET project_attachments='{}'::jsonb WHERE id=?", idea);
		assertThat(ideas.findByAttachmentKey(key)).isEmpty();
	}
}
