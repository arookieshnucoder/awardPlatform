package wtf.hackhub.application.idea;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import wtf.hackhub.application.hackathon.CreateHackathonUseCase;
import wtf.hackhub.support.MockAuthHelper;
import wtf.hackhub.support.PostgresIntegrationTest;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@org.springframework.security.test.context.support.WithMockUser(roles = "ADMIN")
class DeleteNominationsIT extends PostgresIntegrationTest {

	@Autowired
	MockMvc mvc;
	@Autowired
	CreateHackathonUseCase awards;
	UUID admin, owner, award;

	@BeforeEach
	void setup() {
		admin = UUID.fromString(insertProfile("admin@test.com", "Admin", "admin"));
		owner = UUID.fromString(insertProfile("owner@test.com", "Owner", "manager"));
		award = awards.execute(new CreateHackathonUseCase.Command("Award", "Description", Instant.now(),
				Instant.now().plusSeconds(86400), 4, 100, admin, null, List.of(), List.of())).getId();
	}

	UUID nomination() {
		UUID id = jdbc.queryForObject(
				"INSERT INTO ideas(title,description,hackathon_id,created_by,category) VALUES ('Nominee','Impact',?,?,'Customer Values') RETURNING id",
				UUID.class, award, owner);
		jdbc.update("INSERT INTO idea_votes(idea_id,user_id) VALUES (?,?)", id, admin);
		jdbc.update("INSERT INTO comments(idea_id,user_id,content) VALUES (?,?,'Evidence')", id, admin);
		jdbc.update("INSERT INTO judge_scores(hackathon_id,idea_id,judge_id,score) VALUES (?,?,?,8)", award, id, admin);
		return id;
	}

	@Test
	void admin_single_delete_cascades_and_fresh_reads_no_longer_include_nomination() throws Exception {
		UUID id = nomination();
		mvc.perform(delete("/api/v1/ideas/" + id).with(MockAuthHelper.asAdmin(admin)))
				.andExpect(status().isNoContent());
		assertDeleted(id);
		mvc.perform(get("/api/v1/ideas/" + id).with(MockAuthHelper.asAdmin(admin)))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/v1/hackathons/" + award + "/ideas").with(MockAuthHelper.asAdmin(admin)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
		assertThat(jdbc.queryForObject("SELECT count(*) FROM profiles", Integer.class)).isEqualTo(2);
	}

	@Test
	void batch_deletes_only_selected_nominations_and_their_dependents() throws Exception {
		UUID first = nomination(), second = nomination(), retained = nomination();
		mvc.perform(post("/api/v1/ideas/batch-delete").with(MockAuthHelper.asAdmin(admin))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"ids\":[\"" + first + "\",\"" + second + "\"]}"))
				.andExpect(status().isNoContent());
		assertDeleted(first);
		assertDeleted(second);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM ideas WHERE id=?", Integer.class, retained)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE idea_id=?", Integer.class, retained))
				.isEqualTo(1);
	}

	@Test
	void missing_id_rolls_back_entire_batch_and_owner_cannot_delete() throws Exception {
		UUID id = nomination();
		mvc.perform(post("/api/v1/ideas/batch-delete").with(MockAuthHelper.asAdmin(admin))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"ids\":[\"" + id + "\",\"" + UUID.randomUUID() + "\"]}"))
				.andExpect(status().isNotFound());
		mvc.perform(delete("/api/v1/ideas/" + id).with(MockAuthHelper.asManager(owner)))
				.andExpect(status().isForbidden());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM ideas WHERE id=?", Integer.class, id)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE idea_id=?", Integer.class, id))
				.isEqualTo(1);
	}

	void assertDeleted(UUID id) {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM ideas WHERE id=?", Integer.class, id)).isZero();
		for (String table : List.of("idea_votes", "comments", "idea_scores", "judge_scores")) {
			assertThat(jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE idea_id=?", Integer.class, id))
					.isZero();
		}
	}
}
