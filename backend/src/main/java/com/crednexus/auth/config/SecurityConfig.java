package com.crednexus.auth.config;

import com.crednexus.auth.service.KeycloakUserSynchronizationService;
import java.util.Collection;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    KeycloakUserSynchronizationFilter keycloakUserSynchronizationFilter(
            KeycloakUserSynchronizationService synchronizationService
    ) {
        return new KeycloakUserSynchronizationFilter(synchronizationService);
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            KeycloakUserSynchronizationFilter keycloakUserSynchronizationFilter
    ) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/actuator/health").permitAll()
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(keycloakJwtAuthenticationConverter()))
                )
                .addFilterAfter(keycloakUserSynchronizationFilter, BearerTokenAuthenticationFilter.class);

        return http.build();
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken> keycloakJwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter scopeAuthoritiesConverter = new JwtGrantedAuthoritiesConverter();
        JwtAuthenticationConverter authenticationConverter = new JwtAuthenticationConverter();

        authenticationConverter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Set<GrantedAuthority> authorities = new HashSet<>(scopeAuthoritiesConverter.convert(jwt));
            Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");

            if (realmAccess != null && realmAccess.get("roles") instanceof Collection<?> roles) {
                roles.stream()
                        .filter(String.class::isInstance)
                        .map(String.class::cast)
                        .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                        .forEach(authorities::add);
            }

            return authorities;
        });

        return authenticationConverter;
    }
}
