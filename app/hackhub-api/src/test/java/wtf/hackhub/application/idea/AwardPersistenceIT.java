package wtf.hackhub.application.idea;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.MinIOContainer;
import wtf.hackhub.application.hackathon.CreateHackathonUseCase;
import wtf.hackhub.application.judging.*;
import wtf.hackhub.domain.Idea;
import wtf.hackhub.infrastructure.persistence.idea.VotingCriteriaRepository;
import wtf.hackhub.support.MockAuthHelper;
import wtf.hackhub.support.PostgresIntegrationTest;
import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.security.test.context.support.WithMockUser(roles = "ADMIN")
@AutoConfigureMockMvc
class AwardPersistenceIT extends PostgresIntegrationTest {
	static final MinIOContainer MINIO = new MinIOContainer("minio/minio:latest");
	static {
		MINIO.start();
	}
	@DynamicPropertySource
	static void storage(DynamicPropertyRegistry r) {
		r.add("app.minio.endpoint", MINIO::getS3URL);
		r.add("app.minio.access-key", MINIO::getUserName);
		r.add("app.minio.secret-key", MINIO::getPassword);
	}
	@Autowired
	MockMvc mvc;
	@Autowired
	MinioClient minio;
	@Autowired
	wtf.hackhub.infrastructure.config.AppProperties properties;
	@Autowired
	CreateHackathonUseCase awards;
	@Autowired
	SubmitIdeaUseCase nominations;
	@Autowired
	VoteIdeaUseCase voting;
	@Autowired
	InviteJudgeUseCase judges;
	@Autowired
	SubmitJudgeScoreUseCase scores;
	@Autowired
	GetJudgeScoresUseCase rankings;
	@Autowired
	VotingCriteriaRepository criteria;
	final ObjectMapper json = new ObjectMapper();
	UUID admin, voter, own, outside, award, team;
	@BeforeEach
	void setupAward() {
		admin = UUID.fromString(insertProfile("award-admin@test.com", "Award Admin", "admin"));
		voter = UUID.fromString(insertProfile("barriexie@bosch.com", "XIE Barrie", "participant"));
		own = UUID.fromString(insertProfile("leoxu@bosch.com", "XU Leo", "participant"));
		outside = UUID.fromString(insertProfile("nickwang@bosch.com", "WANG Nick", "participant"));
		award = awards.execute(new CreateHackathonUseCase.Command("Digital Pioneer", "Evidence", Instant.now(),
				Instant.now().plusSeconds(86400), 4, 100, admin, null, List.of(), List.of())).getId();
		team = UUID.fromString(
				jdbc.queryForObject("INSERT INTO teams(name,hackathon_id,created_by) VALUES (?,?,?) RETURNING id::text",
						String.class, "Nomination", award, admin));
		jdbc.update("INSERT INTO team_members(team_id,user_id,role) VALUES (?,?,?)", team, admin, "leader");
	}
	Idea nomination(UUID nominee, String extra) {
		return nominations.executeNomination("Contribution", "Measurable impact", award, team, admin, "Customer Values",
				List.of(), Idea.Status.SUBMITTED, null, null,
				"[{\"type\":\"nomination\",\"name\":\"Untrusted\",\"nomineeOrgCode\":\"FAKE\",\"nomineeUserId\":\""
						+ nominee + "\"}" + extra + "]");
	}
	@Test
	void draft_award_accepts_individual_nomination_without_creating_a_team() throws Exception {
		int teamsBefore = jdbc.queryForObject("SELECT count(*) FROM teams WHERE hackathon_id=?", Integer.class, award);
		assertThat(jdbc.queryForObject("SELECT status FROM hackathons WHERE id=?", String.class, award))
				.isEqualTo("draft");
		var payload = json.createObjectNode().put("title", "Individual nominee").put("description", "Business impact")
				.put("category", "Customer Values").put("status", "SUBMITTED")
				.put("projectAttachments", "[{\"type\":\"nomination\",\"nomineeUserId\":\"" + own + "\"}]");
		var response = mvc.perform(post("/api/v1/hackathons/" + award + "/ideas").with(MockAuthHelper.asAdmin(admin))
				.contentType(MediaType.APPLICATION_JSON).content(payload.toString()))
				.andExpect(status().isCreated()).andReturn();
		UUID id = UUID.fromString(json.readTree(response.getResponse().getContentAsString()).get("id").asText());
		assertThat(jdbc.queryForObject("SELECT team_id FROM ideas WHERE id=?", UUID.class, id)).isNull();
		assertThat(jdbc.queryForObject("SELECT status FROM ideas WHERE id=?", String.class, id)).isEqualTo("submitted");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM teams WHERE hackathon_id=?", Integer.class, award))
				.isEqualTo(teamsBefore);
	}

	@Test
	void photo_bytes_are_in_minio_and_keys_and_authoritative_department_are_in_postgres() throws Exception {
		byte[] png = Base64.getDecoder()
				.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=");
		var upload = mvc
				.perform(multipart("/api/v1/storage/upload/project-attachments")
						.file(new MockMultipartFile("file", "nominee.png", "image/png", png))
						.param("prefix", "nominations").with(MockAuthHelper.asAdmin(admin)))
				.andExpect(status().isOk()).andReturn();
		var result = json.readTree(upload.getResponse().getContentAsString());
		String key = result.get("key").asText();
		assertThat(key).startsWith("nominations/").endsWith(".png");
		try (var stored = minio.getObject(GetObjectArgs.builder()
				.bucket(properties.minio().buckets().get("project-attachments")).object(key).build())) {
			assertThat(stored.readAllBytes()).isEqualTo(png);
		}
		var image = json.createObjectNode().put("type", "screenshot").put("name", "Nominee photo")
				.put("storageKey", key).put("url", result.get("url").asText());
		Idea idea = nomination(own, "," + image);
		var persisted = json.readTree(jdbc.queryForObject("SELECT project_attachments::text FROM ideas WHERE id=?",
				String.class, idea.getId()));
		assertThat(persisted.get(0).get("name").asText()).isEqualTo("XU Leo");
		assertThat(persisted.get(0).get("nomineeOrgCode").asText()).isEqualTo("BD/DPA-GOI7");
		assertThat(persisted.get(1).get("storageKey").asText()).isEqualTo(key);
		mvc.perform(get("/api/v1/ideas/" + idea.getId()).with(MockAuthHelper.asParticipant(voter)))
				.andExpect(status().isOk());
		var fresh = mvc.perform(get("/api/v1/storage/url/project-attachments").param("key", key)
				.with(MockAuthHelper.asParticipant(voter))).andExpect(status().isOk()).andReturn();
		String url = json.readTree(fresh.getResponse().getContentAsString()).get("url").asText();
		assertThat(url).startsWith("/storage/").contains("X-Amz-Signature");
		var download = HttpClient.newHttpClient().send(
				HttpRequest.newBuilder(URI.create(MINIO.getS3URL() + url.substring("/storage".length()))).GET().build(),
				HttpResponse.BodyHandlers.ofByteArray());
		assertThat(download.statusCode()).isEqualTo(200);
		assertThat(download.body()).isEqualTo(png);
	}
	@Test
	void comments_create_read_update_delete_and_permissions_use_real_database() throws Exception {
		UUID idea = nomination(own, "").getId();
		String route = "/api/v1/ideas/" + idea + "/comments";
		var created = mvc.perform(post(route).with(MockAuthHelper.asParticipant(voter))
				.contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"  Original 点评  \"}"))
				.andExpect(status().isCreated()).andReturn();
		String id = json.readTree(created.getResponse().getContentAsString()).get("id").asText();
		mvc.perform(get(route).with(MockAuthHelper.asParticipant(own)))
				.andExpect(jsonPath("$[0].content").value("Original 点评"));
		mvc.perform(put(route + "/" + id).with(MockAuthHelper.asParticipant(own))
				.contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"Hijacked\"}"))
				.andExpect(status().isForbidden());
		mvc.perform(delete(route + "/" + id).with(MockAuthHelper.asParticipant(own))).andExpect(status().isForbidden());
		mvc.perform(put(route + "/" + id).with(MockAuthHelper.asParticipant(voter))
				.contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"Updated 点评\"}"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.content").value("Updated 点评"));
		assertThat(jdbc.queryForObject("SELECT content FROM comments WHERE id=?", String.class, UUID.fromString(id)))
				.isEqualTo("Updated 点评");
		mvc.perform(put(route + "/" + id).with(MockAuthHelper.asParticipant(voter))
				.contentType(MediaType.APPLICATION_JSON).content("{\"content\":\" \"}"))
				.andExpect(status().isBadRequest());
		mvc.perform(delete("/api/v1/ideas/" + UUID.randomUUID() + "/comments/" + id)
				.with(MockAuthHelper.asParticipant(voter))).andExpect(status().isNotFound());
		mvc.perform(delete(route + "/" + id).with(MockAuthHelper.asParticipant(voter)))
				.andExpect(status().isNoContent());
		mvc.perform(get(route).with(MockAuthHelper.asParticipant(voter))).andExpect(jsonPath("$.length()").value(0));
		mvc.perform(delete(route + "/" + id).with(MockAuthHelper.asParticipant(voter)))
				.andExpect(status().isNotFound());
		var moderated = mvc.perform(post(route).with(MockAuthHelper.asParticipant(voter))
				.contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"Moderate\"}")).andReturn();
		String moderatedId = json.readTree(moderated.getResponse().getContentAsString()).get("id").asText();
		mvc.perform(delete(route + "/" + moderatedId).with(MockAuthHelper.asAdmin(admin)))
				.andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM comments", Integer.class)).isZero();
	}
	@Test
	void vote_ratio_and_database_trigger_survive_rejected_withdrawal_and_concurrent_requests() throws Exception {
		UUID external = nomination(outside, "").getId(), internal = nomination(own, "").getId(),
				secondInternal = nomination(own, "").getId();
		assertThatThrownBy(() -> voting.execute(internal, voter)).isInstanceOf(IllegalArgumentException.class);
		voting.execute(external, voter);
		try (var executor = Executors.newFixedThreadPool(2)) {
			var results = executor
					.invokeAll(List.<Callable<Boolean>>of(() -> cast(internal), () -> cast(secondInternal)));
			assertThat(results.stream().map(f -> {
				try {
					return f.get();
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			}).filter(Boolean::booleanValue).count()).isEqualTo(1);
		}
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE user_id=?", Integer.class, voter))
				.isEqualTo(2);
		assertThatThrownBy(() -> voting.execute(external, voter)).isInstanceOf(IllegalArgumentException.class);
		assertThat(jdbc.queryForObject("SELECT votes FROM ideas WHERE id=?", Integer.class, external)).isEqualTo(1);
		UUID votedOwn = jdbc.queryForObject("SELECT idea_id FROM idea_votes WHERE user_id=? AND idea_id<>?", UUID.class,
				voter, external);
		voting.execute(votedOwn, voter);
		voting.execute(external, voter);
		assertThat(jdbc.queryForObject("SELECT sum(votes) FROM ideas", Integer.class)).isZero();
	}
	@Test
	void explicit_reset_clears_legacy_invalid_ballots_without_touching_other_voters() {
		UUID idea = nomination(own, "").getId();
		jdbc.update("INSERT INTO idea_votes(idea_id,user_id) VALUES (?,?)", idea, voter);
		jdbc.update("INSERT INTO idea_votes(idea_id,user_id) VALUES (?,?)", idea, outside);
		voting.clearTrack(award, voter, "Customer Values");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE user_id=?", Integer.class, voter))
				.isZero();
		assertThat(jdbc.queryForObject("SELECT votes FROM ideas WHERE id=?", Integer.class, idea)).isEqualTo(1);
	}
	@Test
	void full_ballot_can_withdraw_replace_and_vote_again_after_both_resets() {
		List<UUID> candidates = java.util.stream.IntStream.range(0, 5)
				.mapToObj(index -> nomination(outside, "").getId()).toList();
		for (UUID id : candidates.subList(0, 4))
			assertThat(voting.execute(id, voter).voted()).isTrue();
		assertThatThrownBy(() -> voting.execute(candidates.get(4), voter))
				.isInstanceOf(VoteIdeaUseCase.VoteLimitExceededException.class);
		assertThat(voting.execute(candidates.get(0), voter).voted()).isFalse();
		assertThat(voting.execute(candidates.get(4), voter).voted()).isTrue();
		voting.clearTrack(award, voter, "Customer Values");
		for (UUID id : candidates.subList(0, 4))
			assertThat(voting.execute(id, voter).voted()).isTrue();
		voting.clearAll(voter);
		for (UUID id : candidates.subList(1, 5))
			assertThat(voting.execute(id, voter).voted()).isTrue();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE user_id=?", Integer.class, voter)).isEqualTo(4);
		assertThat(jdbc.queryForObject("SELECT sum(votes) FROM ideas WHERE hackathon_id=?", Integer.class, award)).isEqualTo(4);
	}

	boolean cast(UUID id) {
		try {
			voting.execute(id, voter);
			return true;
		} catch (IllegalArgumentException ex) {
			return false;
		}
	}
	@Test
	void scores_and_review_comments_update_and_delete_with_rank_recalculation() throws Exception {
		UUID idea = nomination(own, "").getId();
		judges.execute(award, voter, admin);
		var rubric = criteria.findAllByHackathonIdOrderByDisplayOrder(award);
		var evaluation = List.of(new SubmitJudgeScoreUseCase.CriterionScore(rubric.get(0).getId(), 8),
				new SubmitJudgeScoreUseCase.CriterionScore(rubric.get(1).getId(), 5));
		scores.submitEvaluation(award, idea, voter, evaluation, "Recommendation: Recommend\n\nEvidence");
		assertThat(rankings.getSummary(award).get(0).panelScore()).isEqualByComparingTo("7.10");
		scores.submitEvaluation(award, idea, voter,
				List.of(new SubmitJudgeScoreUseCase.CriterionScore(rubric.get(0).getId(), 10),
						new SubmitJudgeScoreUseCase.CriterionScore(rubric.get(1).getId(), 10)),
				"Updated evidence");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM judge_scores WHERE idea_id=?", Integer.class, idea))
				.isEqualTo(2);
		assertThat(rankings.getSummary(award).get(0).panelScore()).isEqualByComparingTo("10.00");
		String route = "/api/v1/hackathons/" + award + "/judging/evaluations/" + idea;
		mvc.perform(delete(route).with(MockAuthHelper.asParticipant(own))).andExpect(status().isForbidden());
		mvc.perform(delete(route).with(MockAuthHelper.asParticipant(voter))).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM judge_scores WHERE idea_id=?", Integer.class, idea))
				.isZero();
		assertThat(rankings.getSummary(award).get(0).panelScore()).isNull();
	}
	@Test
	void legacy_metadata_backfill_is_persisted_and_idempotent() throws Exception {
		var idea = nomination(own, "");
		jdbc.update("UPDATE ideas SET project_attachments=?::jsonb WHERE id=?",
				"[{\"type\":\"nomination\",\"nomineeUserId\":\"" + own + "\",\"orgCode\":\"WRONG\"}]", idea.getId());
		String migration = java.nio.file.Files.readString(
				java.nio.file.Path.of("src/main/resources/db/migration/V018__nominee_department_metadata.sql"));
		jdbc.execute(migration);
		jdbc.execute(migration);
		assertThat(jdbc.queryForObject("SELECT project_attachments->0->>'nomineeOrgCode' FROM ideas WHERE id=?",
				String.class, idea.getId())).isEqualTo("BD/DPA-GOI7");
	}
}
