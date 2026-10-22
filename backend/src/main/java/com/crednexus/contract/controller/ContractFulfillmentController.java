package com.crednexus.contract.controller;

import com.crednexus.contract.dto.FulfillmentResponse;
import com.crednexus.contract.service.ContractFulfillmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/loan-applications/{applicationId}/fulfillment")
@Tag(name = "Оформление кредита", description = "Результат автоматического оформления договора и демонстрационной выдачи средств.")
@SecurityRequirement(name = "bearerAuth")
public class ContractFulfillmentController {

    private final ContractFulfillmentService fulfillmentService;

    public ContractFulfillmentController(ContractFulfillmentService fulfillmentService) {
        this.fulfillmentService = fulfillmentService;
    }

    @GetMapping
    @Operation(summary = "Получить статус оформления и выдачи", description = "Возвращает договор и выдачу по заявке. Доступно пользователю с JWT и активным членством в компании-заёмщике.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Статус оформления получен"), @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"), @ApiResponse(responseCode = "403", description = "Нет активного членства в компании"), @ApiResponse(responseCode = "404", description = "Заявка не найдена")})
    public FulfillmentResponse get(@Parameter(description = "Идентификатор кредитной заявки", required = true) @PathVariable UUID applicationId) {
        return fulfillmentService.get(applicationId);
    }

    @PostMapping("/retry")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Повторить оформление или выдачу", description = "Повторно ставит в устойчивую PostgreSQL-очередь неуспешный этап оформления договора или демонстрационной выдачи. Доступно только сотруднику банка.")
    @ApiResponses({@ApiResponse(responseCode = "204", description = "Задача повторно поставлена в очередь"), @ApiResponse(responseCode = "403", description = "Недостаточно прав сотрудника"), @ApiResponse(responseCode = "409", description = "Статус заявки не допускает повторный запуск")})
    public void retry(@Parameter(description = "Идентификатор кредитной заявки", required = true) @PathVariable UUID applicationId) {
        fulfillmentService.retryFulfillment(applicationId);
    }
}
