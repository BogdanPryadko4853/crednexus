package com.crednexus.workflow;

import static org.assertj.core.api.Assertions.assertThat;

import com.crednexus.application.entity.FinancialSnapshot;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.ApplicationStatusHistoryRepository;
import com.crednexus.application.repository.FinancialSnapshotRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.repository.UserRepository;
import com.crednexus.company.entity.Company;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.entity.CompanyMemberRole;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.company.repository.CompanyRepository;
import com.crednexus.decision.entity.CreditOfferStatus;
import com.crednexus.decision.repository.CreditDecisionRepository;
import com.crednexus.decision.repository.CreditOfferRepository;
import com.crednexus.decision.service.DecisionJobWorker;
import com.crednexus.decision.service.OfferExpirationJobWorker;
import com.crednexus.decision.service.OfferService;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.product.repository.CreditProductRepository;
import com.crednexus.scoring.service.ScoringJobWorker;
import com.crednexus.workflow.service.VerificationJobWorker;
import com.crednexus.workflow.service.WorkflowJobService;
import com.crednexus.workflow.service.WorkflowService;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.UUID;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
@TestPropertySource(properties = "spring.task.scheduling.enabled=false")
class WorkflowPipelineIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private UserRepository userRepository;
    @Autowired private CompanyRepository companyRepository;
    @Autowired private CompanyMemberRepository companyMemberRepository;
    @Autowired private CreditProductRepository creditProductRepository;
    @Autowired private LoanApplicationRepository loanApplicationRepository;
    @Autowired private FinancialSnapshotRepository financialSnapshotRepository;
    @Autowired private ApplicationStatusHistoryRepository historyRepository;
    @Autowired private CreditDecisionRepository creditDecisionRepository;
    @Autowired private CreditOfferRepository creditOfferRepository;
    @Autowired private WorkflowService workflowService;
    @Autowired private WorkflowJobService workflowJobService;
    @Autowired private VerificationJobWorker verificationJobWorker;
    @Autowired private ScoringJobWorker scoringJobWorker;
    @Autowired private DecisionJobWorker decisionJobWorker;
    @Autowired private OfferExpirationJobWorker offerExpirationJobWorker;
    @Autowired private OfferService offerService;
    @Autowired private EntityManager entityManager;

    @DynamicPropertySource
    static void configureDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeEach
    void cleanDatabase() {
        entityManager.clear();
        jdbcTemplate.execute("TRUNCATE TABLE users, companies, credit_products RESTART IDENTITY CASCADE");
    }

    @Test
    void processesSuccessfulApplicationToOffered() {
        LoanApplication application = createSubmittedApplication("7701234500", new BigDecimal("10000000"),
                new BigDecimal("6000000"), BigDecimal.ZERO, new BigDecimal("100000"), new BigDecimal("1000000"));

        runPipeline();

        assertThat(status(application.getId())).isEqualTo(LoanApplicationStatus.OFFERED);
        assertThat(creditDecisionRepository.findTopByApplication_IdOrderByDecidedAtDesc(application.getId())).isPresent();
        assertThat(creditOfferRepository.count()).isEqualTo(1);
        assertThat(historyRepository.findAllByApplication_IdOrderByOccurredAtAsc(application.getId()))
                .extracting(history -> history.getToStatus())
                .containsSequence(LoanApplicationStatus.SUBMITTED, LoanApplicationStatus.VERIFYING,
                        LoanApplicationStatus.SCORING, LoanApplicationStatus.OFFERED);
    }

    @Test
    void processesHighRiskApplicationToRejected() {
        LoanApplication application = createSubmittedApplication("7701234550", new BigDecimal("1000000"),
                new BigDecimal("1500000"), new BigDecimal("2000000"), new BigDecimal("60000"), new BigDecimal("1000000"));

        runPipeline();

        assertThat(status(application.getId())).isEqualTo(LoanApplicationStatus.REJECTED);
        assertThat(creditOfferRepository.count()).isZero();
    }

    @Test
    void routesFailedTaxVerificationToManualReview() {
        LoanApplication application = createSubmittedApplication("7701234506", new BigDecimal("10000000"),
                new BigDecimal("6000000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1000000"));

        verificationJobWorker.poll();

        assertThat(status(application.getId())).isEqualTo(LoanApplicationStatus.MANUAL_REVIEW);
        assertThat(creditDecisionRepository.count()).isZero();
    }

    @Test
    void expiresOfferedApplicationThroughPersistentWorkflowQueue() {
        LoanApplication application = createSubmittedApplication("7701234500", new BigDecimal("10000000"),
                new BigDecimal("6000000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1000000"));
        runPipeline();
        jdbcTemplate.update("UPDATE credit_offers SET expires_at = now() - interval '1 second'");
        jdbcTemplate.update("UPDATE workflow_jobs SET available_at = now() WHERE job_type = 'OFFER_EXPIRATION'");

        offerExpirationJobWorker.poll();

        assertThat(status(application.getId())).isEqualTo(LoanApplicationStatus.EXPIRED);
        assertThat(jdbcTemplate.queryForObject("SELECT status FROM credit_offers", String.class)).isEqualTo("EXPIRED");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM workflow_jobs WHERE job_type = 'OFFER_EXPIRATION'", String.class))
                .isEqualTo("COMPLETED");
    }

    @Test
    void concurrentAcceptAndDeclineLeaveOneConsistentTerminalOutcome() throws Exception {
        LoanApplication application = createSubmittedApplication("7701234500", new BigDecimal("10000000"),
                new BigDecimal("6000000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1000000"));
        runPipeline();
        assertThat(status(application.getId())).isEqualTo(LoanApplicationStatus.OFFERED);
        assertThat(creditOfferRepository.count()).isEqualTo(1);
        String keycloakId = application.getCreatedBy().getKeycloakId();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<String> accepted = executor.submit(() -> invokeAs(keycloakId, () -> offerService.accept(application.getId())));
            Future<String> declined = executor.submit(() -> invokeAs(keycloakId, () -> offerService.decline(application.getId())));

            assertThat(List.of(accepted.get(), declined.get())).containsExactlyInAnyOrder("OK", "CONFLICT");
        } finally {
            executor.shutdownNow();
        }

        entityManager.clear();
        LoanApplicationStatus finalStatus = status(application.getId());
        String offerStatus = jdbcTemplate.queryForObject("SELECT status FROM credit_offers", String.class);
        assertThat(finalStatus).isIn(LoanApplicationStatus.ACCEPTED, LoanApplicationStatus.DECLINED);
        assertThat(offerStatus).isEqualTo(finalStatus == LoanApplicationStatus.ACCEPTED
                ? CreditOfferStatus.ACCEPTED.name() : CreditOfferStatus.DECLINED.name());
    }

    @Test
    void reclaimsExpiredLeaseAndContinuesPipeline() {
        LoanApplication application = createSubmittedApplication("7701234500", new BigDecimal("10000000"),
                new BigDecimal("6000000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1000000"));

        assertThat(workflowJobService.claimReadyJobs(com.crednexus.workflow.entity.WorkflowJobType.VERIFICATION,
                Duration.ofSeconds(-1))).hasSize(1);
        runPipeline();

        assertThat(status(application.getId())).isEqualTo(LoanApplicationStatus.OFFERED);
    }

    @Test
    void concurrentWorkersClaimOnlyOneVerificationJob() throws Exception {
        createSubmittedApplication("7701234500", new BigDecimal("10000000"), new BigDecimal("6000000"),
                BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1000000"));
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<List<UUID>> first = executor.submit(() -> workflowJobService.claimReadyJobs(
                    com.crednexus.workflow.entity.WorkflowJobType.VERIFICATION, Duration.ofMinutes(1)));
            Future<List<UUID>> second = executor.submit(() -> workflowJobService.claimReadyJobs(
                    com.crednexus.workflow.entity.WorkflowJobType.VERIFICATION, Duration.ofMinutes(1)));

            assertThat(first.get()).hasSizeLessThanOrEqualTo(1);
            assertThat(second.get()).hasSizeLessThanOrEqualTo(1);
            assertThat(first.get().size() + second.get().size()).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void routesApplicationToManualReviewAfterVerificationRetriesAreExhausted() {
        LoanApplication application = createSubmittedApplication("7701234508", new BigDecimal("10000000"),
                new BigDecimal("6000000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1000000"));

        verificationJobWorker.poll();
        makeRetryImmediatelyAvailable();
        verificationJobWorker.poll();
        makeRetryImmediatelyAvailable();
        verificationJobWorker.poll();

        assertThat(status(application.getId())).isEqualTo(LoanApplicationStatus.MANUAL_REVIEW);
        assertThat(jdbcTemplate.queryForObject("SELECT status FROM workflow_jobs", String.class)).isEqualTo("FAILED");
        assertThat(historyRepository.findAllByApplication_IdOrderByOccurredAtAsc(application.getId()).getLast().getReason())
                .contains("Техническая ошибка");
    }

    private void runPipeline() {
        verificationJobWorker.poll();
        scoringJobWorker.poll();
        decisionJobWorker.poll();
    }

    private void makeRetryImmediatelyAvailable() {
        jdbcTemplate.update("UPDATE workflow_jobs SET available_at = now() WHERE status = 'RETRY_SCHEDULED'");
    }

    private LoanApplication createSubmittedApplication(String inn, BigDecimal revenue, BigDecimal expenses,
                                                        BigDecimal debt, BigDecimal payments, BigDecimal requestedAmount) {
        User user = userRepository.save(new User(UUID.randomUUID().toString(), "user" + inn + "@test.local", "Test User"));
        Company company = companyRepository.save(new Company(inn, "1027700132195", "Test Company", "OOO", "ACTIVE"));
        companyMemberRepository.save(new CompanyMember(user, company, "Owner", true, true, CompanyMemberRole.OWNER));
        CreditProduct product = creditProductRepository.save(new CreditProduct("Business loan", new BigDecimal("10000"),
                new BigDecimal("5000000"), 6, 60, new BigDecimal("15.00"), true));
        LoanApplication application = loanApplicationRepository.save(new LoanApplication(
                company, user, product, requestedAmount, 24, "Working capital"));
        financialSnapshotRepository.save(new FinancialSnapshot(application, revenue, expenses, debt, payments, 10, "2025"));
        workflowService.transition(application, LoanApplicationStatus.SUBMITTED, user);
        loanApplicationRepository.save(application);
        workflowJobService.enqueueVerification(application);
        return application;
    }

    private LoanApplicationStatus status(UUID applicationId) {
        entityManager.clear();
        return loanApplicationRepository.findById(applicationId).orElseThrow().getStatus();
    }

    private String invokeAs(String keycloakId, Runnable action) {
        Jwt jwt = Jwt.withTokenValue("test-token").header("alg", "none").subject(keycloakId).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
        try {
            action.run();
            return "OK";
        } catch (ResponseStatusException exception) {
            return exception.getStatusCode().value() == 409 ? "CONFLICT" : "ERROR_" + exception.getStatusCode().value();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
