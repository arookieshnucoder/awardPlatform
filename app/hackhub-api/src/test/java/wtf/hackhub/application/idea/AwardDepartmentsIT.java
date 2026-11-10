package wtf.hackhub.application.idea;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import wtf.hackhub.support.MockAuthHelper;
import wtf.hackhub.support.PostgresIntegrationTest;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@WithMockUser(roles = "ADMIN")
class AwardDepartmentsIT extends PostgresIntegrationTest {
	@Autowired
	MockMvc mvc;
	@Autowired
	VoteIdeaUseCase votes;
	@Autowired
	NomineeDirectory directory;
	@Autowired
	wtf.hackhub.infrastructure.persistence.auth.ProfileRepository profiles;
	final Map<String, UUID> accounts = new LinkedHashMap<>();
	final String[][] roster = {{"XIE Barrie", "xie.barrie", "BD/DPA-SRE3"}, {"ZOU Yi", "zou.yi", "BD/SWD-WDE1"},
			{"LUO Joya", "luo.joya", "BD/SWD-FSB2"}, {"LI Yangchun Ted", "li.yangchun", "BD/SWD-BEA5"},
			{"WANG Nick", "wang.nick", "BD/PTD-S2P3"}, {"CHEN Xingxing", "chen.xingxing", "BD/ISA-SSP7"}};
	@BeforeEach
	void createAccounts() throws Exception {
		accounts.clear();
		for (String[] entry : roster)
			accounts.put(entry[0],
					UUID.fromString(insertProfile("bd-test." + entry[1] + "@bosch.com", entry[0], "participant")));
		accounts.put("Yiheng.LU",
				UUID.fromString(insertProfile("fixed-term.Yiheng.LU@cn.bosch.com", "Yiheng.LU", "participant")));
		accounts.put("Yaolong.Zhang", UUID.fromString(insertProfile("aah5sgh@bosch.com", "Yaolong.Zhang", "admin")));
		accounts.put("Yaolong Zhang",
				UUID.fromString(insertProfile("fixed-term.Yaolong.ZHANG@cn.bosch.com", "Yaolong Zhang", "admin")));
		accounts.put("Lynette", UUID.fromString(insertProfile("Lynette.LI@cn.bosch.com", "Lynette", "admin")));
		accounts.put("Yining.MA", UUID.fromString(insertProfile("Yining.MA@cn.bosch.com", "Yining.MA", "admin")));
		migrate("V019__award_account_departments.sql");
	}
	void migrate(String file) throws Exception {
		jdbc.execute(new ClassPathResource("db/migration/" + file).getContentAsString(StandardCharsets.UTF_8));
	}
	@Test
	void matches_excel_departments_and_keeps_hrl_participant_out_of_user_management() throws Exception {
		migrate("V019__award_account_departments.sql");
		for (String[] row : roster) {
			var profile = profiles.findById(accounts.get(row[0])).orElseThrow();
			assertThat(profile.getOrgCode()).isEqualTo(row[2]);
			assertThat(directory.resolveParticipant(profile).orElseThrow().getOrganizationalUnit()).isEqualTo(row[2]);
		}
		for (String name : List.of("Yiheng.LU", "Yaolong.Zhang", "Yaolong Zhang", "Lynette", "Yining.MA"))
			assertThat(profiles.findById(accounts.get(name)).orElseThrow().getOrgCode()).isEqualTo("HRL");
		UUID user = accounts.get("Yiheng.LU"), admin = accounts.get("Yaolong.Zhang");
		assertThat(profiles.findById(user).orElseThrow().getRole().toDbValue()).isEqualTo("participant");
		mvc.perform(get("/api/v1/admin/users").with(MockAuthHelper.asParticipant(user)))
				.andExpect(status().isForbidden());
		mvc.perform(patch("/api/v1/admin/users/" + user + "/role").contentType("application/json")
				.content("{\"role\":\"admin\"}").with(MockAuthHelper.asParticipant(user)))
				.andExpect(status().isForbidden());
		mvc.perform(get("/api/v1/admin/users?size=200").with(MockAuthHelper.asAdmin(admin))).andExpect(status().isOk())
				.andExpect(jsonPath("$.content[?(@.name == 'Yiheng.LU')].department").value("HRL"))
				.andExpect(jsonPath("$.content[?(@.name == 'XIE Barrie')].orgCode").value("BD/DPA-SRE3"))
				.andExpect(jsonPath("$.content[?(@.name == 'XIE Barrie')].department").value("BD/DPA"));
		// A later display-name edit cannot change a verified test account's department.
		jdbc.update("UPDATE profiles SET name='WANG Nick' WHERE id=?", accounts.get("XIE Barrie"));
		assertThat(directory.resolveParticipant(profiles.findById(accounts.get("XIE Barrie")).orElseThrow())
				.orElseThrow().getOrganizationalUnit()).isEqualTo("BD/DPA-SRE3");
		UUID unassigned = UUID.fromString(insertProfile("unassigned@bosch.com", "Unassigned", "admin"));
		assertThat(directory.resolveParticipant(profiles.findById(unassigned).orElseThrow())).isEmpty();
	}
	UUID award() {
		return jdbc.queryForObject(
				"INSERT INTO hackathons(title,description,start_date,end_date,created_by,status,registration_key,allowed_participants) VALUES ('Digital Pioneer','Award',now(),now()+interval '1 day',?,'open',gen_random_uuid()::text,100) RETURNING id",
				UUID.class, accounts.get("Yaolong.Zhang"));
	}
	UUID idea(UUID award, String name) {
		UUID nominee = accounts.get(name);
		UUID team = jdbc.queryForObject(
				"INSERT INTO teams(name,hackathon_id,created_by) VALUES (gen_random_uuid()::text,?,?) RETURNING id",
				UUID.class, award, nominee);
		return jdbc.queryForObject(
				"INSERT INTO ideas(title,description,hackathon_id,team_id,created_by,category,status,project_attachments) VALUES ('Contribution','Impact',?,?,?,'Customer Values','submitted',?::jsonb) RETURNING id",
				UUID.class, award, team, nominee,
				"[{\"type\":\"nomination\",\"nomineeUserId\":\"" + nominee + "\",\"nomineeOrgCode\":\"FORGED\"}]");
	}
	@Test
	void real_swd_and_hrl_accounts_obey_partial_full_and_withdrawal_vote_rules() {
		UUID award = award();
		Map<String, UUID> cases = new HashMap<>();
		for (String name : accounts.keySet())
			cases.put(name, idea(award, name));
		UUID swd = accounts.get("ZOU Yi");
		assertThat(votes.execute(cases.get("LUO Joya"), swd).voted()).isTrue();
		assertThat(votes.execute(cases.get("LI Yangchun Ted"), swd).voted()).isTrue();
		assertThatThrownBy(() -> votes.execute(cases.get("ZOU Yi"), swd))
				.isInstanceOf(VoteIdeaUseCase.OwnDepartmentVoteLimitExceededException.class);
		votes.execute(cases.get("WANG Nick"), swd);
		votes.execute(cases.get("CHEN Xingxing"), swd);
		assertThatThrownBy(() -> votes.execute(cases.get("XIE Barrie"), swd))
				.isInstanceOf(VoteIdeaUseCase.VoteLimitExceededException.class);
		assertThat(votes.execute(cases.get("WANG Nick"), swd).voted()).isFalse();
		assertThat(votes.execute(cases.get("CHEN Xingxing"), swd).voted()).isFalse();
		UUID hrl = accounts.get("Yiheng.LU");
		for (String name : List.of("XIE Barrie", "ZOU Yi"))
			assertThat(votes.execute(cases.get(name), hrl).voted()).isTrue();
		assertThatThrownBy(() -> votes.execute(cases.get("WANG Nick"), hrl)).hasMessageContaining("At most 2");
		for (String name : List.of("Yaolong.Zhang", "Yining.MA"))
			assertThat(votes.execute(cases.get(name), hrl).voted()).isTrue();
		assertThatThrownBy(() -> votes.execute(cases.get("LUO Joya"), hrl))
				.isInstanceOf(VoteIdeaUseCase.VoteLimitExceededException.class);
	}
	@Test
	void migrations_change_only_target_copy_and_preserve_nomination_attachments() throws Exception {
		UUID award = award(), idea = idea(award, "Yiheng.LU");
		jdbc.update(
				"UPDATE ideas SET project_attachments=project_attachments || '[{\"type\":\"screenshot\",\"storageKey\":\"keep/photo.png\"}]'::jsonb WHERE id=?",
				idea);
		jdbc.update(
				"UPDATE hackathons SET title='Spring 2026 Hackathon',description='Build something amazing in 48 hours. Open to all skill levels.' WHERE id=?",
				award);
		UUID untouched = award();
		for (int i = 0; i < 2; i++) {
			migrate("V019__award_account_departments.sql");
			migrate("V020__award_demo_campaign_copy.sql");
		}
		assertThat(jdbc.queryForObject("SELECT project_attachments::text FROM ideas WHERE id=?", String.class, idea))
				.contains("HRL", "keep/photo.png").doesNotContain("FORGED");
		assertThat(jdbc.queryForObject("SELECT title FROM hackathons WHERE id=?", String.class, award))
				.isEqualTo("2026 Digital Pioneer Award");
		assertThat(jdbc.queryForObject("SELECT title FROM hackathons WHERE id=?", String.class, untouched))
				.isEqualTo("Digital Pioneer");
	}
	@Test
	void legacy_screenshot_only_cases_show_department_and_share_the_displayed_track_quota() throws Exception {
		UUID campaign = award(), voter = accounts.get("Yiheng.LU");
		Map<String, UUID> cases = new LinkedHashMap<>();
		String[] oldCategories = {"AI & Software", "Industry 4.0", "Developer Tools", "Knowledge Management",
				"Sustainability"};
		int index = 0;
		for (String name : List.of("ZOU Yi", "LUO Joya", "LI Yangchun Ted", "CHEN Xingxing", "WANG Nick")) {
			UUID id = idea(campaign, name);
			cases.put(name, id);
			jdbc.update(
					"UPDATE ideas SET category=?,project_attachments='[{\"type\":\"screenshot\",\"storageKey\":\"keep/photo.svg\"}]'::jsonb WHERE id=?",
					oldCategories[index++], id);
			var result = mvc.perform(get("/api/v1/ideas/" + id).with(MockAuthHelper.asParticipant(voter)))
					.andExpect(status().isOk()).andExpect(jsonPath("$.category").value("Innovation Breakthrough"))
					.andReturn();
			var json = new com.fasterxml.jackson.databind.ObjectMapper();
			var attachments = json.readTree(
					json.readTree(result.getResponse().getContentAsString()).get("projectAttachments").asText());
			assertThat(attachments.get(0).get("storageKey").asText()).isEqualTo("keep/photo.svg");
			assertThat(attachments.get(1).get("name").asText()).isEqualTo(name);
			assertThat(attachments.get(1).get("nomineeOrgCode").asText()).startsWith("BD/");
		}
		for (String name : List.of("ZOU Yi", "LUO Joya"))
			votes.execute(cases.get(name), voter);
		assertThatThrownBy(() -> votes.execute(cases.get("WANG Nick"), voter)).hasMessageContaining("At most 2");
		UUID other = idea(campaign, "XIE Barrie");
		votes.execute(other, voter); // Customer Values still has its own quota.
		for (int i = 0; i < 2; i++)
			migrate("V021__legacy_award_nominees_and_tracks.sql");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE user_id=?", Integer.class, voter))
				.isEqualTo(3);
		assertThat(jdbc.queryForObject("SELECT jsonb_array_length(project_attachments) FROM ideas WHERE id=?",
				Integer.class, cases.get("ZOU Yi"))).isEqualTo(2);
		votes.clearTrack(campaign, voter, "Innovation Breakthrough");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idea_votes WHERE user_id=?", Integer.class, voter))
				.isEqualTo(1);
	}

	@Test
	void repairs_screenshot_rubric_and_saves_excel_score_and_ranking() throws Exception {
		UUID campaign = award(), admin = accounts.get("Yaolong.Zhang"), nominee = idea(campaign, "ZOU Yi");
		for (String name : List.of("111111", "22222", "333333", "444444"))
			jdbc.update("INSERT INTO voting_criteria(hackathon_id,name,weight,display_order) VALUES (?,?,25,0)",
					campaign, name);
		jdbc.update("UPDATE hackathons SET judging_mode='blended',panel_weight=70 WHERE id=?", campaign);
		for (int i = 0; i < 2; i++)
			migrate("V022__repair_unscored_award_rubric.sql");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM voting_criteria WHERE hackathon_id=?", Integer.class,
				campaign)).isEqualTo(2);
		assertThat(jdbc.queryForObject("SELECT judging_mode FROM hackathons WHERE id=?", String.class, campaign))
				.isEqualTo("panel");
		UUID behavior = jdbc.queryForObject("SELECT id FROM voting_criteria WHERE hackathon_id=? AND weight=70",
				UUID.class, campaign);
		UUID impact = jdbc.queryForObject("SELECT id FROM voting_criteria WHERE hackathon_id=? AND weight=30",
				UUID.class, campaign);
		jdbc.update("INSERT INTO hackathon_judges(hackathon_id,user_id,invited_by) VALUES (?,?,?)", campaign, admin,
				admin);
		String body = "{\"ideaId\":\"" + nominee + "\",\"scores\":[{\"criterionId\":\"" + behavior
				+ "\",\"score\":8},{\"criterionId\":\"" + impact
				+ "\",\"score\":5}],\"comment\":\"Recommendation: Recommend\\n\\nEvidence verified\"}";
		mvc.perform(post("/api/v1/hackathons/" + campaign + "/judging/evaluations").contentType("application/json")
				.content(body).with(MockAuthHelper.asAdmin(admin))).andExpect(status().isOk());
		mvc.perform(
				get("/api/v1/hackathons/" + campaign + "/judging/scores/summary").with(MockAuthHelper.asAdmin(admin)))
				.andExpect(status().isOk()).andExpect(jsonPath("$[0].panelScore").value(7.1));
		// Reapplying the already correct template keeps criterion IDs and recorded
		// scores.
		mvc.perform(post("/api/v1/hackathons/" + campaign + "/voting-criteria/award-template")
				.with(MockAuthHelper.asAdmin(admin))).andExpect(status().isOk());
		assertThat(
				jdbc.queryForObject("SELECT count(*) FROM judge_scores WHERE hackathon_id=?", Integer.class, campaign))
				.isEqualTo(2);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM voting_criteria WHERE id IN (?,?)", Integer.class,
				behavior, impact)).isEqualTo(2);
	}

	@Test
	void official_template_replaces_custom_unscored_setup_atomically_but_protects_scores_and_permissions()
			throws Exception {
		UUID campaign = award(), admin = accounts.get("Yaolong.Zhang"), user = accounts.get("Yiheng.LU");
		UUID criterion = jdbc.queryForObject(
				"INSERT INTO voting_criteria(hackathon_id,name,weight,display_order) VALUES (?,'Custom',100,0) RETURNING id",
				UUID.class, campaign);
		String route = "/api/v1/hackathons/" + campaign + "/voting-criteria/award-template";
		mvc.perform(post(route).with(MockAuthHelper.asParticipant(user))).andExpect(status().isForbidden());
		UUID nominee = idea(campaign, "ZOU Yi");
		jdbc.update("INSERT INTO judge_scores(hackathon_id,idea_id,judge_id,criterion_id,score) VALUES (?,?,?,?,8)",
				campaign, nominee, admin, criterion);
		mvc.perform(post(route).with(MockAuthHelper.asAdmin(admin))).andExpect(status().isConflict());
		migrate("V022__repair_unscored_award_rubric.sql");
		assertThat(jdbc.queryForObject("SELECT name FROM voting_criteria WHERE id=?", String.class, criterion))
				.isEqualTo("Custom");
		assertThat(
				jdbc.queryForObject("SELECT count(*) FROM judge_scores WHERE hackathon_id=?", Integer.class, campaign))
				.isEqualTo(1);
		// A separate unscored campaign can be fixed in one call.
		UUID unscored = award();
		jdbc.update("INSERT INTO voting_criteria(hackathon_id,name,weight,display_order) VALUES (?,'Custom',100,0)",
				unscored);
		mvc.perform(post("/api/v1/hackathons/" + unscored + "/voting-criteria/award-template")
				.with(MockAuthHelper.asAdmin(admin))).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2));
		assertThat(jdbc.queryForObject("SELECT sum(weight) FROM voting_criteria WHERE hackathon_id=?", Integer.class,
				unscored)).isEqualTo(100);
	}
}
