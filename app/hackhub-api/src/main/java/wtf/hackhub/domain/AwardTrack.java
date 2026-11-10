package wtf.hackhub.domain;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Canonical award tracks shared by API responses and ballot validation. */
public final class AwardTrack {
	private AwardTrack() {
	}
	public static String normalize(String category, List<String> tags) {
		String raw = category == null ? "" : category.trim();
		for (String official : List.of("Customer Values", "Innovation Breakthrough", "Collaboration to Win"))
			if (official.equalsIgnoreCase(raw))
				return official;
		switch (raw) {
			case "AI & Intelligence" :
				return "Innovation Breakthrough";
			case "Digital Transformation" :
				return "Customer Values";
			case "Green & Sustainability" :
				return "Collaboration to Win";
			default :
				break;
		}
		String searchable = (raw + " " + String.join(" ", tags == null ? List.of() : tags)).toLowerCase(Locale.ROOT);
		if (Pattern.compile("collaborat|team|shared|cross.?department|together|silo").matcher(searchable).find())
			return "Collaboration to Win";
		if (Pattern.compile("customer|client|user|experience|service|process|value").matcher(searchable).find())
			return "Customer Values";
		return "Innovation Breakthrough";
	}
}
