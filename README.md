# Talkme

Talkme is a lightweight, browser-based video calling application built with Spring Boot, WebSocket signaling, WebRTC, React 18, and Thymeleaf. It creates private shareable rooms without accounts or a database.

## Features

- Private room creation with short room IDs.
- Browser-to-browser audio and video using WebRTC.
- WebSocket signaling for SDP offers, answers, and ICE candidates.
- Chrome, Edge, and other modern browser support.
- Local camera, microphone, screen sharing, and hang-up controls.
- Responsive desktop and mobile call layouts.
- Mobile-first copy-link guidance for the room creator.
- Local call history stored only in the browser's `localStorage`.
- Recent-call resume links with remove and clear-history actions.
- Participant display names synchronized through signaling.

## Technology

- Java 26
- Spring Boot 4.1.1
- Spring MVC
- Spring WebSocket
- Thymeleaf
- Maven Wrapper
- React 18 via CDN
- WebRTC APIs in the browser
- Plain CSS and browser JavaScript

## Requirements

- JDK 26 or a compatible configured Java runtime.
- A modern browser with camera and microphone support.
- Maven is not required because the project includes the Maven Wrapper.
- Camera and microphone permissions must be granted by the browser.

For local development, `http://localhost` is accepted by modern browsers for media permissions. For deployment on another host, use HTTPS because camera and microphone access generally requires a secure context.

## Run Locally

From the project root:

```powershell
./mvnw.cmd spring-boot:run
```

Open:

```text
http://localhost:8080/
```

To run the test suite:

```powershell
./mvnw.cmd clean test
```

To build the application:

```powershell
./mvnw.cmd clean package
```

The packaged application can be started with:

```powershell
java -jar target/talkme-0.0.1-SNAPSHOT.jar
```

## How to Use

1. Open the home page.
2. Enter the name that should appear in the call.
3. Select **Start a new call**.
4. Allow camera and microphone access.
5. Copy the room link and send it to one other person.
6. The other person opens the link, enters their display name, and joins.
7. Use the toolbar to mute audio, disable video, share the screen, copy the room link, or leave.

Talkme currently supports a two-person call. Group calling is intentionally not enabled in this version.

## Application Flow

### Creating a room

The home form sends a `POST` request to `/rooms`. `RoomController` generates a random ten-character room ID and redirects the creator to `/rooms/{roomId}?autoJoin=true`.

The `autoJoin` query parameter is an internal handoff flag. The creator already entered a name on the home page, so the room page starts the call directly. A clean shared link does not include this flag, so guests see the name-entry screen.

After the room loads, the browser removes the internal query parameter from the visible URL. The copied link is always the clean form:

```text
/rooms/{roomId}
```

### Joining a room

The room page loads React from a CDN and mounts `CallApp` into the `#call-app` element. The display name is kept in `localStorage` so the same browser can reuse it, but guests still confirm their name before joining a shared room.

After the browser obtains local media with `getUserMedia`, it opens:

```text
ws://localhost:8080/signal?room={roomId}
```

HTTPS deployments automatically use `wss://` instead.

### WebSocket signaling

`WebSocketConfig` maps `/signal` to `SignalingHandler` and allows browser connections to the endpoint.

`SignalingHandler` keeps an in-memory map of rooms and active WebSocket sessions. It does not store video, audio, or chat data. Messages are forwarded only to the other session in the same room.

The main signaling messages are:

- `join`: sends the participant's display name.
- `name`: sends the existing participant's name to a late joiner.
- `peer-joined`: tells the existing participant to create the offer.
- `offer`: carries the WebRTC session offer.
- `answer`: carries the WebRTC session answer.
- `candidate`: carries ICE network candidates.

The existing participant creates the offer. The joining participant answers it. This one-way offer flow avoids both browsers creating offers at the same time.

### WebRTC media

The browser creates one `RTCPeerConnection` for the two-person call. Local audio and video tracks are added to the connection before the `join` message is sent. This prevents a peer from negotiating before its camera tracks exist.

When the remote track arrives, it is attached to the remote video element. ICE candidates received before remote SDP are queued and added after the remote description is set.

STUN is configured with Google's public server:

```text
stun:stun.l.google.com:19302
```

A production deployment may need additional TURN servers for users behind restrictive NATs or firewalls.

## Local Call History

The browser stores recent room metadata under:

```text
talkme.callHistory
```

The stored data includes the room ID, local display name, most recently known participant name, and last-joined timestamp. It does not include media, recordings, messages, or server data.

The home page can display recent calls, reopen a saved room, remove one entry, or clear all entries. A saved-room link uses `autoJoin=true` because it is a local resume action; links copied from the room page never include that internal flag.

The first-call mobile sharing hint is stored per room under a room-specific `localStorage` key and is shown only to the creator on mobile.

## Project Structure

```text
src/main/java/com/application/talkme/
  TalkmeApplication.java   Spring Boot entry point
  RoomController.java      Home, room creation, and room rendering routes
  SignalingHandler.java    In-memory WebSocket signaling relay
  WebSocketConfig.java     WebSocket endpoint registration

src/main/resources/
  templates/home.html      Landing page and local call history shell
  templates/room.html      Room page and React mount point
  static/app.js            Two-person call client and WebRTC controls
  static/history.js        Local call-history rendering and actions
  static/styles.css        Desktop, mobile, landing, and call styles
  application.properties   Spring Boot configuration

src/test/java/
  .../TalkmeApplicationTests.java  Spring application-context test
```

## Important Design Decisions

### No database

Rooms and signaling sessions live in memory on the running server. Restarting the application clears active rooms. Local call history is separate and remains in each browser's `localStorage`.

### No media server

Audio and video are sent peer-to-peer by WebRTC. The Spring server only helps browsers discover and negotiate a connection.

### Two-person scope

The current client intentionally uses one remote video element and one peer connection. Adding group calls requires a different signaling protocol and multiple peer connections, so it is outside the current stable scope.

### Browser permissions

The application cannot access a camera or microphone without browser permission. If a browser has previously denied access, reset the site's camera and microphone permissions and reload the room.

## Troubleshooting

### WebSocket connection fails

- Confirm the Spring Boot process is running on port 8080.
- Open the room through the same host and port as the page.
- Check that `/signal` is registered by `WebSocketConfig`.
- Restart the application after Java changes.
- Refresh the browser after JavaScript changes; the room template uses a versioned `app.js` URL to reduce stale-cache problems.

### Only one video is visible

- Confirm both participants granted camera permission.
- Check the browser console for `getUserMedia`, WebSocket, SDP, or ICE errors.
- Ensure both users opened the same clean room link.
- Test with a fresh room after restarting the server.

### Call works in one direction only

- Verify that both browsers have camera and microphone permissions.
- Confirm the joining browser sends `join` only after acquiring local media.
- Check whether a firewall or network blocks STUN/UDP traffic.
- A TURN server is required for some networks.

### A room link no longer works

- The server must be running.
- A room is an in-memory signaling namespace, not a permanent account or stored meeting.
- Create a fresh room if the old browser tab was closed during an interrupted connection.

## Security and Privacy Notes

- Do not use the development HTTP server for sensitive production calls.
- Deploy behind HTTPS and configure a trusted origin policy instead of `setAllowedOrigins("*")`.
- Add authentication, authorization, rate limiting, and persistent room policy before production use.
- The current server keeps active room/session metadata in memory and does not authenticate room access.
- Do not treat the current implementation as production-grade end-to-end identity or access control.

## License

No license has been selected for this project yet. Add a license before publishing it publicly.
