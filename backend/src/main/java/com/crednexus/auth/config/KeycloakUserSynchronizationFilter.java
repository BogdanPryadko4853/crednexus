package com.crednexus.auth.config;

import com.crednexus.auth.service.KeycloakUserSynchronizationService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

public class KeycloakUserSynchronizationFilter extends OncePerRequestFilter {

    private final KeycloakUserSynchronizationService synchronizationService;

    public KeycloakUserSynchronizationFilter(KeycloakUserSynchronizationService synchronizationService) {
        this.synchronizationService = synchronizationService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication instanceof JwtAuthenticationToken jwtAuthentication) {
            synchronizationService.synchronize(jwtAuthentication.getToken());
        }

        filterChain.doFilter(request, response);
    }
}
