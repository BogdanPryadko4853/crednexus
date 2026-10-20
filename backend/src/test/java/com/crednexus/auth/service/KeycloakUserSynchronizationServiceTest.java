package com.crednexus.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.auth.entity.User;
import com.crednexus.auth.repository.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;

@ExtendWith(MockitoExtension.class)
class KeycloakUserSynchronizationServiceTest {

    @Mock
    private UserRepository userRepository;

    @Captor
    private ArgumentCaptor<User> userCaptor;

    @Test
    void createsLocalUserForFirstAuthenticatedRequest() {
        KeycloakUserSynchronizationService synchronizationService = new KeycloakUserSynchronizationService(userRepository);
        Jwt jwt = jwt("keycloak-user-id", "client@crednexus.local", "Test Client");
        when(userRepository.findByKeycloakId("keycloak-user-id")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        synchronizationService.synchronize(jwt);

        verify(userRepository).save(userCaptor.capture());
        User savedUser = userCaptor.getValue();
        assertThat(savedUser.getKeycloakId()).isEqualTo("keycloak-user-id");
        assertThat(savedUser.getEmail()).isEqualTo("client@crednexus.local");
        assertThat(savedUser.getFullName()).isEqualTo("Test Client");
    }

    @Test
    void updatesLocalProfileFromKeycloakClaims() {
        KeycloakUserSynchronizationService synchronizationService = new KeycloakUserSynchronizationService(userRepository);
        User user = new User("keycloak-user-id", "old@crednexus.local", "Old Name");
        when(userRepository.findByKeycloakId("keycloak-user-id")).thenReturn(Optional.of(user));

        User synchronizedUser = synchronizationService.synchronize(
                jwt("keycloak-user-id", "new@crednexus.local", "New Name")
        );

        assertThat(synchronizedUser.getEmail()).isEqualTo("new@crednexus.local");
        assertThat(synchronizedUser.getFullName()).isEqualTo("New Name");
    }

    private Jwt jwt(String subject, String email, String name) {
        Instant issuedAt = Instant.now();
        return Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(subject)
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plusSeconds(300))
                .claim("email", email)
                .claim("name", name)
                .build();
    }
}
