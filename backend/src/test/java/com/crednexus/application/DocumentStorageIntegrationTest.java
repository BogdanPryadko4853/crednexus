package com.crednexus.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.crednexus.application.entity.DocumentType;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.application.service.DocumentService;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.repository.UserRepository;
import com.crednexus.company.entity.Company;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.entity.CompanyMemberRole;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.company.repository.CompanyRepository;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.product.repository.CreditProductRepository;
import com.crednexus.application.entity.LoanApplication;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@Testcontainers
@TestPropertySource(properties = "spring.task.scheduling.enabled=false")
class DocumentStorageIntegrationTest {

    private static final String BUCKET = "crednexus-documents";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @Container
    static final GenericContainer<?> MINIO = new GenericContainer<>(DockerImageName.parse("minio/minio:RELEASE.2024-12-18T13-15-44Z"))
            .withEnv("MINIO_ROOT_USER", "minioadmin")
            .withEnv("MINIO_ROOT_PASSWORD", "minioadmin123")
            .withCommand("server", "/data")
            .withExposedPorts(9000);

    @Autowired private UserRepository users;
    @Autowired private CompanyRepository companies;
    @Autowired private CompanyMemberRepository members;
    @Autowired private CreditProductRepository products;
    @Autowired private LoanApplicationRepository applications;
    @Autowired private DocumentService documents;
    @Autowired private MinioClient minio;

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("storage.s3.endpoint", () -> "http://" + MINIO.getHost() + ":" + MINIO.getMappedPort(9000));
        registry.add("storage.s3.access-key", () -> "minioadmin");
        registry.add("storage.s3.secret-key", () -> "minioadmin123");
        registry.add("storage.s3.bucket", () -> BUCKET);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void storesAndDownloadsPdfUsingActualMinio() throws Exception {
        try {
            minio.makeBucket(MakeBucketArgs.builder().bucket(BUCKET).build());
        } catch (Exception ignored) {
            // The shared test container can already contain the bucket.
        }
        User user = users.save(new User(UUID.randomUUID().toString(), "document@test.local", "Document User"));
        Company company = companies.save(new Company("7701234500", "1027700132195", "Test", "OOO", "ACTIVE"));
        members.save(new CompanyMember(user, company, "Owner", true, true, CompanyMemberRole.OWNER));
        CreditProduct product = products.save(new CreditProduct("Product", new BigDecimal("10000"), new BigDecimal("5000000"),
                6, 60, new BigDecimal("15"), true));
        LoanApplication application = applications.save(new LoanApplication(company, user, product, new BigDecimal("100000"), 12, "Purpose"));
        authenticate(user.getKeycloakId());

        var uploaded = documents.upload(application.getId(), DocumentType.SUPPORTING_DOCUMENT,
                new MockMultipartFile("file", "proof.pdf", "image/png", "%PDF-1.7\ncontent".getBytes()), null);
        assertThat(uploaded.contentType()).isEqualTo("application/pdf");

        try (InputStream stream = documents.download(uploaded.id()).stream()) {
            assertThat(stream.readAllBytes()).startsWith("%PDF-".getBytes());
        }
    }

    private void authenticate(String keycloakId) {
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(keycloakId).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
    }
}
