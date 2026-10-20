package com.crednexus.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
class FlywayMigrationIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @DynamicPropertySource
    static void configureDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Test
    void appliesInitialMigrationAndCreatesAllDomainTables() {
        Integer appliedMigrations = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success",
                Integer.class
        );

        assertThat(appliedMigrations).isEqualTo(1);

        for (String table : new String[]{
                "users", "companies", "company_members", "credit_products", "loan_applications",
                "financial_snapshots", "verification_results", "scoring_results", "information_requests",
                "application_status_history", "credit_decisions", "credit_offers", "documents",
                "loan_agreements", "disbursements"
        }) {
            assertThat(jdbcTemplate.queryForObject("SELECT to_regclass(?)", String.class, table))
                    .as("table %s must exist", table)
                    .isNotNull();
        }
    }
}
