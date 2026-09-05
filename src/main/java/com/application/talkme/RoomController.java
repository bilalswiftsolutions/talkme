package com.application.talkme;

import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.view.RedirectView;

@Controller
public class RoomController {

	@GetMapping("/")
	public String home() {
		return "home";
	}

	@PostMapping("/rooms")
	public RedirectView createRoom() {
		String roomId = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
		return new RedirectView("/rooms/" + roomId + "?autoJoin=true");
	}

	@GetMapping("/rooms/{roomId}")
	public String room(@PathVariable String roomId, @RequestParam(defaultValue = "false") boolean autoJoin, Map<String, Object> model) {
		model.put("roomId", roomId);
		model.put("autoJoin", autoJoin);
		return "room";
	}
}