package com.crednexus.product.controller;

import com.crednexus.product.dto.CreateCreditProductRequest;
import com.crednexus.product.dto.CreditProductResponse;
import com.crednexus.product.dto.UpdateCreditProductRequest;
import com.crednexus.product.service.CreditProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Кредитные продукты", description = "Каталог условий кредитования.")
@SecurityRequirement(name = "bearerAuth")
public class CreditProductController {

    private final CreditProductService creditProductService;

    public CreditProductController(CreditProductService creditProductService) {
        this.creditProductService = creditProductService;
    }

    @GetMapping
    @Operation(
            summary = "Получить активные кредитные продукты",
            description = "Возвращает только активные продукты, отсортированные по названию. Доступно любому авторизованному пользователю."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Список активных продуктов получен"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк")
    })
    public List<CreditProductResponse> getActiveProducts() {
        return creditProductService.getActiveProducts();
    }

    @GetMapping("/{productId}")
    @Operation(
            summary = "Получить активный кредитный продукт",
            description = "Возвращает продукт по идентификатору, только если он активен."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Продукт получен"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "404", description = "Активный продукт не найден")
    })
    public CreditProductResponse getActiveProduct(
            @Parameter(description = "Идентификатор кредитного продукта", required = true) @PathVariable UUID productId
    ) {
        return creditProductService.getActiveProduct(productId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            summary = "Создать кредитный продукт",
            description = "Создаёт продукт с лимитами суммы, срока и базовой ставкой. Доступно только ролям ADMIN и BANK_EMPLOYEE."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Продукт создан"),
            @ApiResponse(responseCode = "400", description = "Некорректные поля или минимальное значение больше максимального"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Недостаточно глобальной роли Keycloak")
    })
    public CreditProductResponse createProduct(@Valid @RequestBody CreateCreditProductRequest request) {
        return creditProductService.createProduct(request);
    }

    @PatchMapping("/{productId}")
    @Operation(
            summary = "Изменить кредитный продукт",
            description = "Частично обновляет продукт, включая его активность. Итоговые минимальные и максимальные значения суммы и срока проверяются согласованно. Доступно только ролям ADMIN и BANK_EMPLOYEE."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Продукт обновлён"),
            @ApiResponse(responseCode = "400", description = "Некорректные поля или некорректный итоговый диапазон"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Недостаточно глобальной роли Keycloak"),
            @ApiResponse(responseCode = "404", description = "Продукт не найден")
    })
    public CreditProductResponse updateProduct(
            @Parameter(description = "Идентификатор кредитного продукта", required = true) @PathVariable UUID productId,
            @Valid @RequestBody UpdateCreditProductRequest request
    ) {
        return creditProductService.updateProduct(productId, request);
    }
}
