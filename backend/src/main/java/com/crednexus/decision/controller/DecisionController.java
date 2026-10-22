package com.crednexus.decision.controller;

import com.crednexus.decision.dto.CreditDecisionResponse;
import com.crednexus.decision.service.DecisionService;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/loan-applications/{applicationId}/decision")
@Tag(name = "Кредитные решения", description = "Результаты автоматического решения и предложенные условия кредитования.")
@SecurityRequirement(name = "bearerAuth")
public class DecisionController {

    private final DecisionService decisionService;

    public DecisionController(DecisionService decisionService) {
        this.decisionService = decisionService;
    }

    @GetMapping
    @Operation(
            summary = "Получить последнее кредитное решение",
            description = "Возвращает последнее финальное решение по заявке и оффер, если заявка одобрена. Доступно только активному представителю компании-заёмщика. Для заявки в MANUAL_REVIEW финального решения ещё нет."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Кредитное решение получено"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет активного доступа к компании заявки"),
            @ApiResponse(responseCode = "404", description = "Заявка или финальное кредитное решение не найдены")
    })
    public CreditDecisionResponse getLatestDecision(
            @Parameter(description = "Идентификатор кредитной заявки", required = true) @PathVariable UUID applicationId
    ) {
        return decisionService.getLatestDecision(applicationId);
    }
}
