package wtf.hackhub.presentation.award;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import wtf.hackhub.application.idea.NomineeDirectory;
import wtf.hackhub.application.storage.StoragePort;
import wtf.hackhub.domain.Hackathon;
import wtf.hackhub.domain.Idea;
import wtf.hackhub.infrastructure.config.SecurityConfig;
import wtf.hackhub.infrastructure.persistence.hackathon.HackathonRepository;
import wtf.hackhub.infrastructure.persistence.idea.IdeaRepository;
import wtf.hackhub.infrastructure.security.JwtAuthFilter;
import wtf.hackhub.infrastructure.security.JwtProvider;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PublicAwardController.class)
@Import({SecurityConfig.class, JwtAuthFilter.class})
@TestPropertySource(properties = {"app.cors.allowed-origins=http://localhost:5173",
		"app.minio.endpoint=http://localhost:9000", "app.minio.access-key=test", "app.minio.secret-key=test"})
class PublicAwardControllerTest {
	@Autowired
	MockMvc mvc;
	@MockBean
	HackathonRepository awards;
	@MockBean
	IdeaRepository ideas;
	@MockBean
	NomineeDirectory nominees;
	@MockBean
	StoragePort storage;
	@MockBean
	JwtProvider jwtProvider;
	static final UUID ID = UUID.randomUUID();

	private Hackathon award(Hackathon.Visibility visibility, Hackathon.Status status) {
		var award = mock(Hackathon.class);
		when(award.getId()).thenReturn(ID);
		when(award.getTitle()).thenReturn("2026 Award");
		when(award.getVisibility()).thenReturn(visibility);
		when(award.getStatus()).thenReturn(status);
		return award;
	}

	@Test
	void guestsCanReadPublishedPublicAwardsWithoutRegistrationKeys() throws Exception {
		var publicAward = award(Hackathon.Visibility.PUBLIC, Hackathon.Status.RUNNING);
		when(awards.findByVisibilityAndStatusNotOrderByCreatedAtDesc(eq(Hackathon.Visibility.PUBLIC),
				eq(Hackathon.Status.DRAFT), any())).thenReturn(new PageImpl<>(List.of(publicAward)));
		mvc.perform(get("/api/v1/public/awards")).andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].title").value("2026 Award"))
				.andExpect(jsonPath("$.content[0].registrationKey").doesNotExist());
	}

	@Test
	void guestsCannotReadPrivateOrDraftCampaigns() throws Exception {
		var privateAward = award(Hackathon.Visibility.PRIVATE, Hackathon.Status.RUNNING);
		var draftAward = award(Hackathon.Visibility.PUBLIC, Hackathon.Status.DRAFT);
		when(awards.findById(ID)).thenReturn(Optional.of(privateAward));
		mvc.perform(get("/api/v1/public/awards/" + ID + "/nominations")).andExpect(status().isNotFound());
		when(awards.findById(ID)).thenReturn(Optional.of(draftAward));
		mvc.perform(get("/api/v1/public/awards/" + ID + "/nominations")).andExpect(status().isNotFound());
		verifyNoInteractions(ideas);
	}

	@Test
	void publicNominationOmitsScoresAndIdentityIdsAndSignsOnlyItsOwnPhoto() throws Exception {
		var publicAward = award(Hackathon.Visibility.PUBLIC, Hackathon.Status.RUNNING);
		when(awards.findById(ID)).thenReturn(Optional.of(publicAward));
		var idea = new Idea("Nominee", "Achievement", ID, null, UUID.randomUUID(), "Customer Values");
		idea.update("Nominee", "Achievement", "Customer Values", List.of(), Idea.Status.SUBMITTED, null, null, "[]");
		when(ideas.findByHackathonIdAndStatusNotOrderByCreatedAtDesc(eq(ID), eq(Idea.Status.DRAFT), any()))
				.thenReturn(new PageImpl<>(List.of(idea)));
		when(nominees.enrichLegacy(anyString(), any())).thenReturn(
				"[{\"type\":\"nomination\",\"name\":\"Associate\",\"nomineeUserId\":\"hidden\",\"nomineeOrgCode\":\"BD/DPA-SRE3\"},{\"type\":\"screenshot\",\"storageKey\":\"projects/photo.jpg\"}]");
		when(storage.presignedDownloadUrl("hackhub-project-attachments", "projects/photo.jpg", 3600))
				.thenReturn("https://media.example/photo.jpg");
		mvc.perform(get("/api/v1/public/awards/" + ID + "/nominations")).andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].nominee_name").value("Associate"))
				.andExpect(jsonPath("$.content[0].images[0]").value("https://media.example/photo.jpg"))
				.andExpect(jsonPath("$.content[0].totalScore").doesNotExist())
				.andExpect(jsonPath("$.content[0].createdBy").doesNotExist());
	}

	@Test
	void votingAndManagementStillRequireAuthentication() throws Exception {
		mvc.perform(post("/api/v1/ideas/" + ID + "/votes")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/v1/hackathons/" + ID + "/judging/scores/all")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/v1/public/awards")).andExpect(status().isUnauthorized());
	}
}
