package wtf.hackhub.application.judging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import wtf.hackhub.application.idea.NominationApprovalDirectory;
import wtf.hackhub.domain.Idea;
import wtf.hackhub.domain.JudgeScore;
import wtf.hackhub.domain.VotingCriteria;
import wtf.hackhub.infrastructure.persistence.IdeaMutationLock;
import wtf.hackhub.infrastructure.persistence.idea.IdeaRepository;
import wtf.hackhub.infrastructure.persistence.idea.VotingCriteriaRepository;
import wtf.hackhub.infrastructure.persistence.judging.HackathonJudgeRepository;
import wtf.hackhub.infrastructure.persistence.judging.JudgeScoreRepository;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SubmitJudgeScoreUseCase {
	private final IdeaMutationLock mutationLock;
	private final NominationApprovalDirectory approvalDirectory;
	private final ObjectMapper mapper;

	private final JudgeScoreRepository scoreRepository;
	private final HackathonJudgeRepository judgeRepository;
	private final IdeaRepository ideaRepository;
	private final VotingCriteriaRepository criteriaRepository;

	public SubmitJudgeScoreUseCase(JudgeScoreRepository scoreRepository, HackathonJudgeRepository judgeRepository,
			IdeaRepository ideaRepository, VotingCriteriaRepository criteriaRepository, IdeaMutationLock mutationLock,
			NominationApprovalDirectory approvalDirectory, ObjectMapper mapper) {
		this.approvalDirectory = approvalDirectory;
		this.mapper = mapper;
		this.scoreRepository = scoreRepository;
		this.judgeRepository = judgeRepository;
		this.ideaRepository = ideaRepository;
		this.mutationLock = mutationLock;
		this.criteriaRepository = criteriaRepository;
	}

	private record Reviewer(Optional<String> hodKey, boolean assigned) {
		boolean canOpenCommittee() {
			return assigned || hodKey.isPresent();
		}
	}

	private Reviewer reviewer(UUID campaignId, UUID userId) {
		var hodKey = approvalDirectory.reviewerKey(userId);
		return new Reviewer(hodKey,
				hodKey.isEmpty() && judgeRepository.existsByHackathonIdAndUserId(campaignId, userId));
	}

	private boolean mayScore(Idea idea, Reviewer reviewer, boolean awardRubric) {
		if (!awardRubric && idea.getApprovalStatus() == null)
			return reviewer.canOpenCommittee();
		return !idea.isSuperseded() && idea.getStatus() != Idea.Status.DRAFT
				&& reviewer.hodKey().filter(key -> scoringHeadKeys(idea).contains(key)).isPresent();
	}

	Set<String> scoringHeadKeys(Idea idea) {
		var heads = new HashSet<String>();
		var headKey = idea.getApprovalHeadKey();
		if (headKey != null && !headKey.isBlank() && !headKey.startsWith("admin:")) {
			heads.add(headKey.strip().toLowerCase(Locale.ROOT));
		} else {
			approvalDirectory.employee(idea.getCreatedBy())
					.filter(employee -> employee.hodEmail() != null && !employee.hodEmail().isBlank())
					.map(approvalDirectory::headKey).ifPresent(heads::add);
		}
		JsonNode nomination = nominationDetails(idea);
		if (idea.getTeamId() != null || "team".equals(nomination.path("nominationType").asText())) {
			for (String entry : nomination.path("coreTeamMembers").asText().split("[;；]")) {
				if (!entry.isBlank())
					approvalDirectory.memberHeadKey(entry.strip()).ifPresent(heads::add);
			}
		}
		return heads;
	}

	private JsonNode nominationDetails(Idea idea) {
		String attachments = idea.getProjectAttachments();
		if (attachments != null && !attachments.isBlank()) {
			try {
				var items = mapper.readTree(attachments);
				if (items != null && items.isArray()) {
					for (var item : items) {
						if ("nomination".equals(item.path("type").asText()))
							return item;
					}
				}
			} catch (JsonProcessingException ignored) {
				// Historical metadata cannot grant additional scoring access.
			}
		}
		return MissingNode.getInstance();
	}

	@Transactional(readOnly = true)
	public List<UUID> eligibleNominations(UUID hackathonId, UUID userId) {
		var reviewer = reviewer(hackathonId, userId);
		if (!reviewer.canOpenCommittee())
			return List.of();
		boolean awardRubric = criteriaRepository.findAllByHackathonIdOrderByDisplayOrder(hackathonId).stream()
				.anyMatch(DigitalPioneerCriteria::official);
		return ideaRepository.findAllByHackathonId(hackathonId).stream()
				.filter(idea -> mayScore(idea, reviewer, awardRubric)).map(Idea::getId).toList();
	}

	@Transactional
	public JudgeScore execute(UUID hackathonId, UUID ideaId, UUID judgeId, UUID criterionId, int score,
			String comment) {
		var currentCriteria = currentCriteria(hackathonId);
		requireScorableIdea(hackathonId, ideaId, judgeId, currentCriteria);
		if (currentCriteria.stream().anyMatch(DigitalPioneerCriteria::official) && (currentCriteria.size() != 3
				|| currentCriteria.stream().noneMatch(c -> c.getId().equals(criterionId))))
			throw new IllegalArgumentException("Use the three current award-category criteria");
		if (criterionId != null) {
			var criterion = criteriaRepository.findById(criterionId)
					.orElseThrow(() -> new IllegalArgumentException("Criterion not found"));
			if (!hackathonId.equals(criterion.getHackathonId()))
				throw new IllegalArgumentException("Criterion belongs to another award");
		} else if (!currentCriteria.isEmpty()) {
			throw new IllegalArgumentException("A scoring criterion is required");
		}
		return saveScore(hackathonId, ideaId, judgeId, criterionId, score, comment);
	}

	private JudgeScore saveScore(UUID hackathonId, UUID ideaId, UUID judgeId, UUID criterionId, int score,
			String comment) {
		return scoreRepository.findByIdeaIdAndJudgeIdAndCriterionId(ideaId, judgeId, criterionId).map(existing -> {
			existing.update(score, comment);
			return scoreRepository.save(existing);
		}).orElseGet(
				() -> scoreRepository.save(new JudgeScore(hackathonId, ideaId, judgeId, criterionId, score, comment)));
	}

	public record CriterionScore(UUID criterionId, int score) {
	}

	@Transactional
	public List<JudgeScore> submitEvaluation(UUID hackathonId, UUID ideaId, UUID judgeId, List<CriterionScore> scores,
			String comment) {
		var criteria = currentCriteria(hackathonId);
		requireScorableIdea(hackathonId, ideaId, judgeId, criteria);
		if (criteria.stream().anyMatch(DigitalPioneerCriteria::official) && criteria.size() != 3)
			throw new IllegalArgumentException("Use the three current award-category criteria");
		var expected = criteria.stream().map(c -> c.getId()).collect(Collectors.toSet());
		var supplied = new HashSet<UUID>();
		if (scores == null || scores.isEmpty())
			throw new IllegalArgumentException("All criteria must be scored");
		for (var score : scores) {
			if (score.criterionId() == null || !supplied.add(score.criterionId()) || score.score() < 1
					|| score.score() > 10)
				throw new IllegalArgumentException("Provide each criterion once with an integer score from 1 to 10");
		}
		if (!expected.equals(supplied))
			throw new IllegalArgumentException("All award criteria must be scored together");
		return scores.stream().map(s -> saveScore(hackathonId, ideaId, judgeId, s.criterionId(), s.score(), comment))
				.toList();
	}

	@Transactional
	public void deleteEvaluation(UUID hackathonId, UUID ideaId, UUID judgeId) {
		requireScorableIdea(hackathonId, ideaId, judgeId, currentCriteria(hackathonId));
		scoreRepository.deleteAll(scoreRepository.findAllByIdeaId(ideaId).stream()
				.filter(score -> score.getJudgeId().equals(judgeId)).toList());
	}

	private List<VotingCriteria> currentCriteria(UUID hackathonId) {
		return DigitalPioneerCriteria.current(criteriaRepository.findAllByHackathonIdOrderByDisplayOrder(hackathonId));
	}

	private void requireScorableIdea(UUID hackathonId, UUID ideaId, UUID judgeId, List<VotingCriteria> criteria) {
		var reviewer = reviewer(hackathonId, judgeId);
		if (!reviewer.canOpenCommittee())
			throw new NotAJudgeException(judgeId, hackathonId);
		mutationLock.acquire(ideaId);
		var idea = ideaRepository.findById(ideaId).orElseThrow(() -> new IllegalArgumentException("Case not found"));
		idea.requireApprovalPublished();
		if (!hackathonId.equals(idea.getHackathonId()))
			throw new IllegalArgumentException("Case belongs to another award");
		if (!mayScore(idea, reviewer, criteria.stream().anyMatch(DigitalPioneerCriteria::official)))
			throw new NotAJudgeException(judgeId, hackathonId);
	}

	public static class NotAJudgeException extends RuntimeException {
		public NotAJudgeException(UUID userId, UUID hackathonId) {
			super("User " + userId + " is not a judge for hackathon " + hackathonId);
		}
	}
}
