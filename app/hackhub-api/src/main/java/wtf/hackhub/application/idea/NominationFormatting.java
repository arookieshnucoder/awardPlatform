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
			var counter = new AnswerSize();
			for (int index = 0; index < answer.size(); index++) {
				var block = answer.get(index);
				if (index > 0) text.append('\n');
				if (block.has("table")) appendTable(block, text, counter);
				else appendLine(block, text, counter);
				if (text.length() > 32_000) throw invalidFormatting();
			}
			result.add(text.toString().strip());
		}
		return result;
	}

	private static final class AnswerSize {
		int lines;
		int runs;
		int cells;
	}

	private static void appendTable(JsonNode block, StringBuilder text, AnswerSize size) {
		var table = block.path("table");
		if (block.size() != 1 || !table.isArray() || table.isEmpty() || table.size() > 30)
			throw invalidFormatting();
		int width = table.get(0).size();
		if (width < 1 || width > 12 || (size.cells += width * table.size()) > 1200)
			throw invalidFormatting();
		for (int rowIndex = 0; rowIndex < table.size(); rowIndex++) {
			var row = table.get(rowIndex);
			if (!row.isArray() || row.size() != width) throw invalidFormatting();
			if (rowIndex > 0) text.append('\n');
			for (int column = 0; column < width; column++) {
				var cell = row.get(column);
				if (!cell.isArray()) throw invalidFormatting();
				if (column > 0) text.append('\t');
				for (int line = 0; line < cell.size(); line++) {
					if (line > 0) text.append('\n');
					appendLine(cell.get(line), text, size);
				}
			}
		}
	}

	private static void appendLine(JsonNode line, StringBuilder text, AnswerSize size) {
		if (++size.lines > 4000 || !line.isObject() || !line.path("runs").isArray()
				|| line.properties().stream().anyMatch(field -> !LINE_FIELDS.contains(field.getKey())))
			throw invalidFormatting();
		if (line.has("list") && !Set.of("bullet", "number").contains(line.path("list").asText()))
			throw invalidFormatting();
		for (var run : line.path("runs")) {
			if (++size.runs > 4096 || !run.isObject() || !run.path("text").isTextual()
					|| run.properties().stream().anyMatch(field -> !"text".equals(field.getKey())
							&& (!MARKS.contains(field.getKey()) || !field.getValue().isBoolean() || !field.getValue().asBoolean())))
				throw invalidFormatting();
			String value = run.path("text").asText();
			if (value.isEmpty() || value.contains("\n") || value.contains("\r")
					|| value.length() > 32_000 - text.length()) throw invalidFormatting();
			text.append(value);
		}
	}

	private static IllegalArgumentException invalidFormatting() {
		return new IllegalArgumentException("Invalid nomination answer formatting.");
	}
}
