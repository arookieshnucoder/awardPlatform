package wtf.hackhub.application.idea;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import wtf.hackhub.domain.Profile;
import wtf.hackhub.domain.VotingParticipant;
import wtf.hackhub.infrastructure.persistence.auth.ProfileRepository;
import wtf.hackhub.infrastructure.persistence.idea.VotingParticipantRepository;
import java.util.*;
import java.util.regex.*;
import java.util.stream.Collectors;

/** Shared roster identity resolution for persisted nominations and voting. */
@Service
public class NomineeDirectory {
	private static final Pattern NAME_TOKEN = Pattern.compile("[a-z0-9]+");
	private final ProfileRepository profileRepository;
	private final VotingParticipantRepository participantRepository;
	public NomineeDirectory(ProfileRepository profiles, VotingParticipantRepository participants) {
		profileRepository = profiles;
		participantRepository = participants;
	}
	public String enrichLegacy(String attachments, UUID creatorId) {
		try {
			var mapper = new ObjectMapper();
			var items = attachments == null || attachments.isBlank()
					? mapper.createArrayNode()
					: mapper.readTree(attachments);
			if (!items.isArray())
				throw new IllegalArgumentException("Nomination attachments must be an array");
			boolean hasNomination = false;
			for (var item : items) {
				if (!"nomination".equals(item.path("type").asText()))
					continue;
				hasNomination = true;
				if (!item.hasNonNull("nomineeUserId"))
					((ObjectNode) item).put("nomineeUserId", creatorId.toString());
			}
			if (!hasNomination)
				((com.fasterxml.jackson.databind.node.ArrayNode) items).addObject().put("type", "nomination")
						.put("url", "").put("nomineeUserId", creatorId.toString());
			return enrich(items.toString(), false);
		} catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
			throw new IllegalArgumentException("Invalid nomination attachments");
		}
	}
	public String enrich(String attachments, boolean required) {
		if (attachments == null || attachments.isBlank())
			return attachments;
		try {
			var items = new ObjectMapper().readTree(attachments);
			if (!items.isArray())
				throw new IllegalArgumentException("Nomination attachments must be an array");
			for (var item : items) {
				if (!"nomination".equals(item.path("type").asText()))
					continue;
				if (!item.hasNonNull("nomineeUserId") && !required)
					continue;
				var profile = profileRepository.findById(UUID.fromString(item.path("nomineeUserId").asText()));
				var participant = profile.flatMap(this::resolveParticipant);
				if (participant.isEmpty() && required)
					throw new IllegalArgumentException(
							"Nominee department is missing or ambiguous in the associate roster. Please contact an administrator.");
				var nomination = (ObjectNode) item;
				nomination.remove("orgCode");
				nomination.remove("nomineeOrgCode");
				if (participant.isPresent())
					nomination.put("nomineeOrgCode", participant.get().getOrganizationalUnit().trim());
				profile.ifPresent(value -> nomination.put("name", value.getName()));
			}
			return items.toString();
		} catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
			throw new IllegalArgumentException("Invalid nomination attachments");
		}
	}
	public Optional<VotingParticipant> resolveParticipant(Profile profile) {
		if (profile.getOrgCode() != null && !profile.getOrgCode().isBlank()) {
			return Optional.of(new VotingParticipant("profile:" + profile.getId(), profile.getOrgCode().trim(),
					profile.getName(), normalizeIdentity(profile.getName())));
		}
		String emailLocalPart = profile.getEmail().split("@", 2)[0].replaceFirst("(?i)^fixed-term[._-]*", "");
		Optional<VotingParticipant> byEmail = uniqueParticipant(normalizeIdentity(emailLocalPart));
		if (byEmail.isPresent())
			return byEmail;

		Optional<VotingParticipant> byName = uniqueParticipant(normalizeIdentity(profile.getName()));
		if (byName.isPresent())
			return byName;

		return Optional.empty();
	}

	private Optional<VotingParticipant> uniqueParticipant(String normalizedName) {
		if (normalizedName.isBlank())
			return Optional.empty();
		List<VotingParticipant> matches = participantRepository.findAllByNormalizedName(normalizedName);
		return matches.size() == 1 && matches.get(0).getOrganizationalUnit() != null
				&& !matches.get(0).getOrganizationalUnit().isBlank() ? Optional.of(matches.get(0)) : Optional.empty();
	}

	public static String normalizeIdentity(String value) {
		int slash = value.lastIndexOf('/');
		String englishName = slash >= 0 ? value.substring(slash + 1) : value;
		Matcher matcher = NAME_TOKEN.matcher(englishName.toLowerCase(Locale.ROOT));
		List<String> tokens = matcher.results().map(result -> result.group()).filter(token -> !token.equals("mr"))
				.filter(token -> !token.equals("ms")).filter(token -> !token.equals("mrs"))
				.filter(token -> !token.equals("dr")).sorted(Comparator.naturalOrder()).toList();
		return tokens.stream().collect(Collectors.joining());
	}

	public static String departmentCode(String organizationalUnit) {
		organizationalUnit = organizationalUnit.trim();
		int separator = organizationalUnit.indexOf('-');
		return separator < 0 ? organizationalUnit : organizationalUnit.substring(0, separator);
	}

}
