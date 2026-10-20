package com.crednexus.auth.controller;

import com.crednexus.auth.dto.CurrentUserResponse;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class CurrentUserController {

    private final CurrentUserProvider currentUserProvider;

    public CurrentUserController(CurrentUserProvider currentUserProvider) {
        this.currentUserProvider = currentUserProvider;
    }

    @GetMapping("/me")
    public CurrentUserResponse getCurrentUser(Authentication authentication) {
        User user = currentUserProvider.getCurrentUser();
        Set<String> roles = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith("ROLE_"))
                .map(authority -> authority.substring("ROLE_".length()))
                .collect(Collectors.toUnmodifiableSet());

        return new CurrentUserResponse(
                user.getId(),
                user.getKeycloakId(),
                user.getEmail(),
                user.getFullName(),
                roles
        );
    }
}
