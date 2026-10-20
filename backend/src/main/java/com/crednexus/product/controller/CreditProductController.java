package com.crednexus.product.controller;

import com.crednexus.product.dto.CreateCreditProductRequest;
import com.crednexus.product.dto.CreditProductResponse;
import com.crednexus.product.dto.UpdateCreditProductRequest;
import com.crednexus.product.service.CreditProductService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/credit-products")
public class CreditProductController {

    private final CreditProductService creditProductService;

    public CreditProductController(CreditProductService creditProductService) {
        this.creditProductService = creditProductService;
    }

    @GetMapping
    public List<CreditProductResponse> getActiveProducts() {
        return creditProductService.getActiveProducts();
    }

    @GetMapping("/{productId}")
    public CreditProductResponse getActiveProduct(@PathVariable UUID productId) {
        return creditProductService.getActiveProduct(productId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreditProductResponse createProduct(@Valid @RequestBody CreateCreditProductRequest request) {
        return creditProductService.createProduct(request);
    }

    @PatchMapping("/{productId}")
    public CreditProductResponse updateProduct(
            @PathVariable UUID productId,
            @Valid @RequestBody UpdateCreditProductRequest request
    ) {
        return creditProductService.updateProduct(productId, request);
    }
}
