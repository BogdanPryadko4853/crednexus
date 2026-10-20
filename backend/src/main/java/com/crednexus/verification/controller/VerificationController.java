package com.crednexus.verification.controller;

import com.crednexus.verification.dto.VerificationRunResponse;
import com.crednexus.verification.service.VerificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/loan-applications/{applicationId}/verifications")
@Tag(name = "Проверки", description = "Технический запуск и хранение результатов проверок ФНС и БКИ.")
@SecurityRequirement(name = "bearerAuth")
public class VerificationController {

    private final VerificationService verificationService;

    public VerificationController(VerificationService verificationService) {
        this.verificationService = verificationService;
    }

    @PostMapping("/run")
    @Operation(
            summary = "Запустить проверки ФНС и БКИ",
            description = "Технический endpoint для демо, доступный только ADMIN и BANK_EMPLOYEE. При первом запуске переводит заявку из SUBMITTED в VERIFYING, выполняет независимые mock-проверки и сохраняет новую попытку каждой доступной проверки. При повторе запускаются только источники с последним статусом ERROR; максимум три попытки на источник. Автоматического перехода к скорингу или запросу сведений не выполняется."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Проверки выполнены, результаты новой попытки сохранены"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Недостаточно глобальной роли Keycloak"),
            @ApiResponse(responseCode = "404", description = "Заявка не найдена"),
            @ApiResponse(responseCode = "409", description = "Статус заявки не допускает проверки или нет проверок, доступных для повтора")
    })
    public VerificationRunResponse runVerifications(
            @Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId
    ) {
        return verificationService.runVerifications(applicationId);
    }
}
