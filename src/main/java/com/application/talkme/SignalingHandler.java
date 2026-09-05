package com.application.talkme;

import java.net.URI;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class SignalingHandler extends TextWebSocketHandler {

	private final Map<String, Map<String, WebSocketSession>> rooms = new ConcurrentHashMap<>();
	private static final Pattern JOIN_NAME = Pattern.compile("\\\"type\\\"\\s*:\\s*\\\"join\\\".*?\\\"name\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"");

	@Override
	public void afterConnectionEstablished(WebSocketSession session) {
		String roomId = roomId(session);
		if (roomId == null) {
			return;
		}
		session.getAttributes().put("roomId", roomId);
		rooms.computeIfAbsent(roomId, ignored -> new ConcurrentHashMap<>()).put(session.getId(), session);
	}

	@Override
	protected void handleTextMessage(WebSocketSession session, TextMessage message) {
		String roomId = (String) session.getAttributes().get("roomId");
		Map<String, WebSocketSession> room = rooms.get(roomId);
		if (room == null) {
			return;
		}
		if (isLeaveMessage(message)) {
			notifyPeerLeft(room, session);
			session.getAttributes().put("leaveNotified", true);
			removeSession(session);
			try {
				session.close();
			} catch (Exception ignored) {
				// The browser may already have closed the connection.
			}
			return;
		}
		String name = joinName(message);
		if (name != null) {
			session.getAttributes().put("name", name);
			room.values().stream()
					.filter(peer -> !peer.getId().equals(session.getId()) && peer.isOpen())
					.map(peer -> (String) peer.getAttributes().get("name"))
					.filter(existingName -> existingName != null)
					.forEach(existingName -> send(session, nameMessage(existingName)));
		}
		TextMessage forwardedMessage = name == null ? message : peerJoinedMessage(name);
		room.values().stream()
				.filter(peer -> !peer.getId().equals(session.getId()) && peer.isOpen())
				.forEach(peer -> send(peer, forwardedMessage));
	}

	@Override
	public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
		notifyIfNeeded(session);
		removeSession(session);
	}

	@Override
	public void handleTransportError(WebSocketSession session, Throwable exception) {
		notifyIfNeeded(session);
		removeSession(session);
	}

	private void notifyIfNeeded(WebSocketSession session) {
		if (Boolean.TRUE.equals(session.getAttributes().get("leaveNotified"))) {
			return;
		}
		String roomId = (String) session.getAttributes().get("roomId");
		Map<String, WebSocketSession> room = rooms.get(roomId);
		if (room != null) {
			notifyPeerLeft(room, session);
		}
	}

	private void removeSession(WebSocketSession session) {
		String roomId = (String) session.getAttributes().get("roomId");
		if (roomId == null) {
			return;
		}
		Map<String, WebSocketSession> room = rooms.get(roomId);
		if (room != null) {
			room.remove(session.getId());
			if (room.isEmpty()) {
				rooms.remove(roomId);
			}
		}
	}

	private void notifyPeerLeft(Map<String, WebSocketSession> room, WebSocketSession session) {
		TextMessage message = new TextMessage("{\"type\":\"peer-left\"}");
		room.values().stream()
				.filter(peer -> !peer.getId().equals(session.getId()) && peer.isOpen())
				.forEach(peer -> send(peer, message));
	}

	private void send(WebSocketSession session, TextMessage message) {
		try {
			session.sendMessage(message);
		} catch (Exception ignored) {
			// A peer may close between the open check and this send.
		}
	}

	private String joinName(TextMessage message) {
		Matcher matcher = JOIN_NAME.matcher(message.getPayload());
		if (!matcher.find()) {
			return null;
		}
		return matcher.group(1).replace("\\\\", "\\").replace("\\\"", "\"");
	}

	private boolean isLeaveMessage(TextMessage message) {
		return message.getPayload().contains("\"type\":\"leave\"");
	}

	private TextMessage nameMessage(String name) {
		String escapedName = name.replace("\\", "\\\\").replace("\"", "\\\"");
		return new TextMessage("{\"type\":\"name\",\"name\":\"" + escapedName + "\"}");
	}

	private TextMessage peerJoinedMessage(String name) {
		String escapedName = name.replace("\\", "\\\\").replace("\"", "\\\"");
		return new TextMessage("{\"type\":\"peer-joined\",\"name\":\"" + escapedName + "\"}");
	}

	private String roomId(WebSocketSession session) {
		URI uri = session.getUri();
		if (uri == null || uri.getQuery() == null || !uri.getQuery().startsWith("room=")) {
			return null;
		}
		return uri.getQuery().substring("room=".length());
	}
}