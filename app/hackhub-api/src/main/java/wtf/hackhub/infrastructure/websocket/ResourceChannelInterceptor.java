package wtf.hackhub.infrastructure.websocket;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import wtf.hackhub.infrastructure.persistence.team.TeamMemberRepository;
import wtf.hackhub.infrastructure.security.HackathonSecurityService;

import java.util.UUID;

/**
 * Deny unknown destinations and authorize before subscribing or delivering a
 * message.
 */
@Component
public class ResourceChannelInterceptor implements ChannelInterceptor {
	private final TeamMemberRepository members;
	private final HackathonSecurityService hackathons;

	public ResourceChannelInterceptor(TeamMemberRepository members, HackathonSecurityService hackathons) {
		this.members = members;
		this.hackathons = hackathons;
	}

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
		if (accessor == null
				|| (accessor.getCommand() != StompCommand.SUBSCRIBE && accessor.getCommand() != StompCommand.SEND))
			return message;
		if (!(accessor.getUser() instanceof Authentication auth) || !auth.isAuthenticated()
				|| !(auth.getPrincipal() instanceof UUID userId))
			throw new AccessDeniedException("Authentication required");
		String destination = accessor.getDestination();
		boolean subscribe = accessor.getCommand() == StompCommand.SUBSCRIBE;
		boolean allowed = subscribe && "/user/queue/notifications".equals(destination);
		if (destination != null) {
			try {
				String teamPrefix = subscribe ? "/topic/team." : "/app/team.";
				String suffix = subscribe ? ".chat" : ".message";
				if (destination.startsWith(teamPrefix) && destination.endsWith(suffix)) {
					UUID teamId = UUID.fromString(
							destination.substring(teamPrefix.length(), destination.length() - suffix.length()));
					allowed = members.existsByTeamIdAndUserId(teamId, userId);
				} else if (subscribe && destination.startsWith("/topic/hackathon.")
						&& destination.endsWith(".updates")) {
					UUID id = UUID.fromString(destination.substring("/topic/hackathon.".length(),
							destination.length() - ".updates".length()));
					allowed = hackathons.canView(id, auth);
				}
			} catch (IllegalArgumentException ignored) {
				allowed = false;
			}
		}
		if (!allowed)
			throw new AccessDeniedException("No access to this destination");
		return message;
	}
}
