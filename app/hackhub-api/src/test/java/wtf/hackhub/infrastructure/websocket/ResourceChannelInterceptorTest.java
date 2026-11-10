package wtf.hackhub.infrastructure.websocket;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import wtf.hackhub.infrastructure.persistence.team.TeamMemberRepository;
import wtf.hackhub.infrastructure.security.HackathonSecurityService;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResourceChannelInterceptorTest {
	@Mock
	TeamMemberRepository members;
	@Mock
	HackathonSecurityService hackathons;
	@InjectMocks
	ResourceChannelInterceptor interceptor;
	final UUID user = UUID.randomUUID(), resource = UUID.randomUUID();
	final Authentication auth = new UsernamePasswordAuthenticationToken(user, null, List.of());

	Message<byte[]> message(StompCommand command, String destination, Authentication principal) {
		var accessor = StompHeaderAccessor.create(command);
		accessor.setDestination(destination);
		accessor.setUser(principal);
		accessor.setLeaveMutable(true);
		return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
	}

	@Test
	void team_subscribe_and_send_require_membership() {
		var subscribe = message(StompCommand.SUBSCRIBE, "/topic/team." + resource + ".chat", auth);
		var send = message(StompCommand.SEND, "/app/team." + resource + ".message", auth);
		assertThatThrownBy(() -> interceptor.preSend(subscribe, null)).isInstanceOf(AccessDeniedException.class);
		assertThatThrownBy(() -> interceptor.preSend(send, null)).isInstanceOf(AccessDeniedException.class);
		when(members.existsByTeamIdAndUserId(resource, user)).thenReturn(true);
		assertThat(interceptor.preSend(subscribe, null)).isSameAs(subscribe);
		assertThat(interceptor.preSend(send, null)).isSameAs(send);
	}

	@Test
	void campaign_subscribe_requires_resource_access() {
		var message = message(StompCommand.SUBSCRIBE, "/topic/hackathon." + resource + ".updates", auth);
		assertThatThrownBy(() -> interceptor.preSend(message, null)).isInstanceOf(AccessDeniedException.class);
		when(hackathons.canView(resource, auth)).thenReturn(true);
		assertThat(interceptor.preSend(message, null)).isSameAs(message);
	}

	@Test
	void arbitrary_broker_destinations_and_spoofed_broadcasts_are_rejected() {
		for (String destination : List.of("/topic/team.*.chat", "/topic/team." + resource + ".chat",
				"/queue/notifications")) {
			assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.SEND, destination, auth), null))
					.isInstanceOf(AccessDeniedException.class);
		}
		assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.SUBSCRIBE, "/topic/team.*.chat", auth), null))
				.isInstanceOf(AccessDeniedException.class);
	}

	@Test
	void notifications_require_authenticated_session() {
		var message = message(StompCommand.SUBSCRIBE, "/user/queue/notifications", auth);
		assertThat(interceptor.preSend(message, null)).isSameAs(message);
		assertThatThrownBy(
				() -> interceptor.preSend(message(StompCommand.SUBSCRIBE, "/user/queue/notifications", null), null))
				.isInstanceOf(AccessDeniedException.class);
	}
}
