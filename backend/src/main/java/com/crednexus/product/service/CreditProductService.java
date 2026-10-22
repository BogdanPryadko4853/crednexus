package com.crednexus.product.service;

import com.crednexus.product.dto.CreateCreditProductRequest;
import com.crednexus.product.dto.CreditProductResponse;
import com.crednexus.product.dto.UpdateCreditProductRequest;
import com.crednexus.product.entity.CreditProduct;
import com.crednexus.product.repository.CreditProductRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CreditProductService {

    private final CreditProductRepository creditProductRepository;

    public CreditProductService(CreditProductRepository creditProductRepository) {
        this.creditProductRepository = creditProductRepository;
    }

    @Transactional(readOnly = true)
    public List<CreditProductResponse> getActiveProducts() {
        return creditProductRepository.findAllByActiveTrueOrderByNameAsc().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public CreditProductResponse getActiveProduct(UUID productId) {
        return creditProductRepository.findByIdAndActiveTrue(productId)
                .map(this::toResponse)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Credit product not found"));
    }

    @Transactional
    public CreditProductResponse createProduct(CreateCreditProductRequest request) {
        validateRanges(request.minAmount(), request.maxAmount(), request.minTermMonths(), request.maxTermMonths());
        CreditProduct product = creditProductRepository.save(new CreditProduct(
                request.name(),
                request.minAmount(),
                request.maxAmount(),
                request.minTermMonths(),
                request.maxTermMonths(),
                request.baseRate(),
                request.active()
        ));

        return toResponse(product);
    }

    @Transactional
    public CreditProductResponse updateProduct(UUID productId, UpdateCreditProductRequest request) {
        CreditProduct product = creditProductRepository.findById(productId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Credit product not found"));

        ProductValues values = ProductValues.merge(product, request);
        validateRanges(values.minAmount(), values.maxAmount(), values.minTermMonths(), values.maxTermMonths());
        values.applyTo(product);

        return toResponse(product);
    }

    private void validateRanges(
            BigDecimal minAmount,
            BigDecimal maxAmount,
            Integer minTermMonths,
            Integer maxTermMonths
    ) {
        if (minAmount.compareTo(maxAmount) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Minimum amount cannot exceed maximum amount");
        }
        if (minTermMonths > maxTermMonths) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Minimum term cannot exceed maximum term");
        }
    }

    private CreditProductResponse toResponse(CreditProduct product) {
        return new CreditProductResponse(
                product.getId(),
                product.getName(),
                product.getMinAmount(),
                product.getMaxAmount(),
                product.getMinTermMonths(),
                product.getMaxTermMonths(),
                product.getBaseRate(),
                product.isActive()
        );
    }

    private record ProductValues(
            String name,
            BigDecimal minAmount,
            BigDecimal maxAmount,
            Integer minTermMonths,
            Integer maxTermMonths,
            BigDecimal baseRate,
            boolean active
    ) {

        private static ProductValues merge(CreditProduct product, UpdateCreditProductRequest request) {
            return new ProductValues(
                    valueOrCurrent(request.name(), product.getName()),
                    valueOrCurrent(request.minAmount(), product.getMinAmount()),
                    valueOrCurrent(request.maxAmount(), product.getMaxAmount()),
                    valueOrCurrent(request.minTermMonths(), product.getMinTermMonths()),
                    valueOrCurrent(request.maxTermMonths(), product.getMaxTermMonths()),
                    valueOrCurrent(request.baseRate(), product.getBaseRate()),
                    valueOrCurrent(request.active(), product.isActive())
            );
        }

        private void applyTo(CreditProduct product) {
            product.setName(name);
            product.setMinAmount(minAmount);
            product.setMaxAmount(maxAmount);
            product.setMinTermMonths(minTermMonths);
            product.setMaxTermMonths(maxTermMonths);
            product.setBaseRate(baseRate);
            product.setActive(active);
        }

        private static <T> T valueOrCurrent(T requestedValue, T currentValue) {
            return requestedValue != null ? requestedValue : currentValue;
        }
    }
}
