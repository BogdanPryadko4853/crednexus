package com.crednexus.verification.controller;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.crednexus.auth.config.SecurityConfig;
import com.crednexus.auth.service.KeycloakUserSynchronizationService;
import com.crednexus.verification.service.VerificationService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = VerificationController.class)
@Import({SecurityConfig.class, VerificationControllerSecurityTest.WebSecurityConfiguration.class})
class VerificationControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private VerificationService verificationService;

    @MockitoBean
    private KeycloakUserSynchronizationService keycloakUserSynchronizationService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void rejectsUnauthenticatedVerificationRun() throws Exception {
        mockMvc.perform(post(endpoint(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsClientRoleForVerificationRun() throws Exception {
        mockMvc.perform(post(endpoint(UUID.randomUUID()))
                        .with(user("client").roles("CLIENT")))
                .andExpect(status().isForbidden());
    }

    @Test
    void allowsBankEmployeeToRunVerifications() throws Exception {
        UUID applicationId = UUID.randomUUID();
        mockMvc.perform(post(endpoint(applicationId))
                        .with(user("employee").roles("BANK_EMPLOYEE")))
                .andExpect(status().isAccepted());

        verify(verificationService).requestVerification(eq(applicationId));
    }

    private String endpoint(UUID applicationId) {
        return "/api/loan-applications/" + applicationId + "/verifications/run";
    }

    @TestConfiguration
    @EnableWebSecurity
    static class WebSecurityConfiguration {
    }
}
