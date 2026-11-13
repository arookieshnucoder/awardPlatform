package wtf.hackhub.application.idea;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NominationFormattingTest {
	private final ObjectMapper mapper = new ObjectMapper();
	private final String answers = """
			[
			  [{"runs":[{"text":"Summary","bold":true},{"text":" with <angle brackets>","italic":true,"underline":true}]}],
			  [{"list":"number","runs":[{"text":"First"}]},{"list":"number","runs":[{"text":"Second"}]}],
			  [{"list":"bullet","runs":[{"text":"Culture"}]}]
			]
			""";

	@Test
	void derives_plain_description_from_formatted_answers_and_preserves_legacy_text() throws Exception {
		var attachments = mapper.readTree("[{\"type\":\"nomination\",\"formattedAnswers\":" + answers + "}]");
		assertThat(NominationFormatting.individualDescription(attachments, "Supplied text"))
				.contains("Executive Summary\nSummary with <angle brackets>", "\nFirst\nSecond", "\nCulture")
				.doesNotContain("Supplied text");
		assertThat(NominationFormatting.individualDescription(mapper.createArrayNode(), "Legacy")).isEqualTo("Legacy");
	}

	@Test
	void table_text_is_preserved_and_irregular_rows_are_rejected() throws Exception {
		String tableAnswers = """
				[
				  [{"table":[[[{"runs":[{"text":"Impact","bold":true}]}],[{"runs":[{"text":"40%"}]}]],
				             [[{"runs":[{"text":"Time"}]}],[{"runs":[{"text":"3 days"}]}]]]}],
				  [{"runs":[{"text":"Details"}]}],
				  [{"runs":[{"text":"Culture"}]}]
				]
				""";
		var nomination = mapper.createObjectNode().put("type", "nomination").put("achievementSummary", "Impact\t40%\nTime\t3 days")
				.put("teamAchievementImpact", "Details").put("cultureDemonstration", "Culture");
		nomination.set("formattedAnswers", mapper.readTree(tableAnswers));
		NominationFormatting.validateTeamAnswers(nomination);
		assertThat(NominationFormatting.individualDescription(mapper.createArrayNode().add(nomination), "Legacy"))
				.contains("Impact\t40%\nTime\t3 days");
		((com.fasterxml.jackson.databind.node.ArrayNode) nomination.at("/formattedAnswers/0/0/table/1")).remove(1);
		assertThatThrownBy(() -> NominationFormatting.validateTeamAnswers(nomination))
				.isInstanceOf(IllegalArgumentException.class).hasMessageContaining("formatting");
	}

	@Test
	void rejects_unsupported_properties_and_mismatched_team_text() throws Exception {
		var malformed = mapper.readTree("[{\"type\":\"nomination\",\"formattedAnswers\":"
				+ answers.replace("\"bold\":true", "\"html\":\"extra\"") + "}]");
		assertThatThrownBy(() -> NominationFormatting.individualDescription(malformed, "Description"))
				.isInstanceOf(IllegalArgumentException.class).hasMessageContaining("formatting");
		var team = mapper.createObjectNode().put("achievementSummary", "Summary with <angle brackets>")
				.put("teamAchievementImpact", "First\nSecond").put("cultureDemonstration", "Culture");
		team.set("formattedAnswers", mapper.readTree(answers));
		NominationFormatting.validateTeamAnswers(team);
		team.put("teamAchievementImpact", "Different text");
		assertThatThrownBy(() -> NominationFormatting.validateTeamAnswers(team))
				.isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match");
	}
}
