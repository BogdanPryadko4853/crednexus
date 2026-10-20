package com.crednexus.auth.service;

import com.crednexus.auth.entity.User;
import com.crednexus.auth.repository.UserRepository;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KeycloakUserSynchronizationService {

    private final UserRepository userRepository;

    public KeycloakUserSynchronizationService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public User synchronize(Jwt jwt) {
        String keycloakId = requiredClaim(jwt, "sub");
        String email = requiredClaim(jwt, "email");
        String fullName = requiredClaim(jwt, "name");

        return userRepository.findByKeycloakId(keycloakId)
                .map(user -> updateUser(user, email, fullName))
                .orElseGet(() -> userRepository.save(new User(keycloakId, email, fullName)));
    }

    private User updateUser(User user, String email, String fullName) {
        user.setEmail(email);
        user.setFullName(fullName);
        return user;
    }

    private String requiredClaim(Jwt jwt, String claimName) {
        String claimValue = jwt.getClaimAsString(claimName);

        if (claimValue == null || claimValue.isBlank()) {
            throw new IllegalArgumentException("JWT claim '%s' is required".formatted(claimName));
        }

        return claimValue;
    }
}
