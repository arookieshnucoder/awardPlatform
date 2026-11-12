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
