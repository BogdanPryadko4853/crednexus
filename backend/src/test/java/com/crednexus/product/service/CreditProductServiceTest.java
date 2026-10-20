package com.crednexus.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.crednexus.product.dto.CreateCreditProductRequest;
import com.crednexus.product.dto.UpdateCreditProductRequest;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.product.repository.CreditProductRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class CreditProductServiceTest {

    @Mock
    private CreditProductRepository creditProductRepository;

    @InjectMocks
    private CreditProductService creditProductService;

    @Test
    void createsProductWithValidAmountAndTermRanges() {
        when(creditProductRepository.save(any(CreditProduct.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = creditProductService.createProduct(request(
                new BigDecimal("100000.00"), new BigDecimal("1000000.00"), 6, 36
        ));

        assertThat(response.name()).isEqualTo("Working capital loan");
        assertThat(response.minAmount()).isEqualByComparingTo("100000.00");
        assertThat(response.maxTermMonths()).isEqualTo(36);
    }

    @Test
    void rejectsProductWithInvertedAmountRange() {
        assertThatThrownBy(() -> creditProductService.createProduct(request(
                new BigDecimal("1000000.00"), new BigDecimal("100000.00"), 6, 36
        )))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST)
                );
    }

    @Test
    void updatesProductAfterValidatingResultingRanges() {
        UUID productId = UUID.randomUUID();
        CreditProduct product = new CreditProduct(
                "Working capital loan",
                new BigDecimal("100000.00"),
                new BigDecimal("1000000.00"),
                6,
                36,
                new BigDecimal("15.50"),
                true
        );
        when(creditProductRepository.findById(productId)).thenReturn(Optional.of(product));

        var response = creditProductService.updateProduct(
                productId,
                new UpdateCreditProductRequest(null, null, null, null, 48, new BigDecimal("14.90"), false)
        );

        assertThat(response.maxTermMonths()).isEqualTo(48);
        assertThat(response.baseRate()).isEqualByComparingTo("14.90");
        assertThat(response.active()).isFalse();
    }

    @Test
    void returnsOnlyActiveProducts() {
        CreditProduct activeProduct = new CreditProduct(
                "Working capital loan",
                new BigDecimal("100000.00"),
                new BigDecimal("1000000.00"),
                6,
                36,
                new BigDecimal("15.50"),
                true
        );
        when(creditProductRepository.findAllByActiveTrueOrderByNameAsc()).thenReturn(List.of(activeProduct));

        var products = creditProductService.getActiveProducts();

        assertThat(products).hasSize(1);
        assertThat(products.getFirst().active()).isTrue();
    }

    private CreateCreditProductRequest request(
            BigDecimal minAmount,
            BigDecimal maxAmount,
            int minTermMonths,
            int maxTermMonths
    ) {
        return new CreateCreditProductRequest(
                "Working capital loan",
                minAmount,
                maxAmount,
                minTermMonths,
                maxTermMonths,
                new BigDecimal("15.50"),
                true
        );
    }
}
