package wtf.hackhub.application.idea;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Validates the optional structured formatting stored with a nomination. */
final class NominationFormatting {
	private static final Set<String> LINE_FIELDS = Set.of("runs", "list");
	private static final Set<String> MARKS = Set.of("bold", "italic", "underline");
	private static final int[] INDIVIDUAL_LENGTHS = {1200, 2400, 2000};
	private static final List<String> TEAM_FIELDS = List.of("achievementSummary", "teamAchievementImpact",
			"cultureDemonstration");
	private static final List<String> INDIVIDUAL_HEADINGS = List.of("Executive Summary",
			"Details of Your Core Achievement in 2026 and Business Impact (including financial figures)",
			"How You Demonstrate Bosch China Culture (Especially in Your Applied Category)");

	private NominationFormatting() { }

	static String individualDescription(JsonNode attachments, String description) {
		for (var item : attachments) {
			if (!"nomination".equals(item.path("type").asText()) || !item.has("formattedAnswers")) continue;
			var answers = readAnswers(item.get("formattedAnswers"));
			var sections = new ArrayList<String>();
			for (int i = 0; i < answers.size(); i++) {
				if (answers.get(i).isBlank() || answers.get(i).length() > INDIVIDUAL_LENGTHS[i])
					throw new IllegalArgumentException("Check the length of each nomination answer.");
				sections.add(INDIVIDUAL_HEADINGS.get(i) + "\n" + answers.get(i));
			}
			return String.join("\n\n", sections);
		}
		return description;
	}

	static void validateTeamAnswers(JsonNode nomination) {
		if (!nomination.has("formattedAnswers")) return;
		var answers = readAnswers(nomination.get("formattedAnswers"));
		for (int i = 0; i < answers.size(); i++) {
			if (!answers.get(i).equals(nomination.path(TEAM_FIELDS.get(i)).asText().strip()))
				throw new IllegalArgumentException("The team nomination text and formatting do not match.");
		}
	}

	private static List<String> readAnswers(JsonNode answers) {
		if (!answers.isArray() || answers.size() != 3) throw invalidFormatting();
		var result = new ArrayList<String>();
		for (var answer : answers) {
			if (!answer.isArray() || answer.isEmpty() || answer.size() > 4000) throw invalidFormatting();
			var text = new StringBuilder();
			int runCount = 0;
			for (int index = 0; index < answer.size(); index++) {
				var line = answer.get(index);
				if (!line.isObject() || !line.path("runs").isArray()
						|| line.properties().stream().anyMatch(field -> !LINE_FIELDS.contains(field.getKey())))
					throw invalidFormatting();
				if (line.has("list") && !Set.of("bullet", "number").contains(line.path("list").asText()))
					throw invalidFormatting();
				if (index > 0) text.append('\n');
				for (var run : line.path("runs")) {
					if (++runCount > 4096 || !run.isObject() || !run.path("text").isTextual()
							|| run.properties().stream().anyMatch(field -> !"text".equals(field.getKey())
								&& (!MARKS.contains(field.getKey()) || !field.getValue().isBoolean() || !field.getValue().asBoolean())))
						throw invalidFormatting();
					String value = run.path("text").asText();
					if (value.isEmpty() || value.contains("\n") || value.contains("\r")
							|| value.length() > 32_000 - text.length()) throw invalidFormatting();
					text.append(value);
				}
				if (text.length() > 32_000) throw invalidFormatting();
			}
			result.add(text.toString().strip());
		}
		return result;
	}

	private static IllegalArgumentException invalidFormatting() {
		return new IllegalArgumentException("Invalid nomination answer formatting.");
	}
}
