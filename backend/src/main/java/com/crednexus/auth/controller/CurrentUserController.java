package com.crednexus.auth.controller;

import com.crednexus.auth.dto.CurrentUserResponse;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@Tag(name = "Пользователь", description = "Данные авторизованного пользователя CredNexus.")
@SecurityRequirement(name = "bearerAuth")
public class CurrentUserController {

    private final CurrentUserProvider currentUserProvider;

    public CurrentUserController(CurrentUserProvider currentUserProvider) {
        this.currentUserProvider = currentUserProvider;
    }

    @GetMapping("/me")
    @Operation(
            summary = "Получить профиль текущего пользователя",
            description = "Возвращает локальную проекцию пользователя, синхронизированную из Keycloak, и глобальные роли из JWT."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Профиль успешно получен"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк")
    })
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
