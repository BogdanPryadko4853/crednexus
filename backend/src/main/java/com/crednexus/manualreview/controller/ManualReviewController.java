package com.crednexus.manualreview.controller;

import com.crednexus.decision.dto.CreditDecisionResponse;
import com.crednexus.manualreview.dto.CreateInformationRequest;
import com.crednexus.manualreview.dto.ManualDecisionRequest;
import com.crednexus.manualreview.dto.ManualReviewApplicationResponse;
import com.crednexus.manualreview.service.ManualReviewService;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/manual-review/loan-applications")
@Tag(name = "Ручное рассмотрение", description = "Рабочее место сотрудника банка для заявок в статусе MANUAL_REVIEW.")
@SecurityRequirement(name = "bearerAuth")
public class ManualReviewController {
    private final ManualReviewService service;

    public ManualReviewController(ManualReviewService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "Получить очередь ручного рассмотрения", description = "Возвращает заявки в MANUAL_REVIEW. Доступно только ADMIN и BANK_EMPLOYEE.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Очередь получена"), @ApiResponse(responseCode = "403", description = "Недостаточно прав сотрудника")})
    public List<ManualReviewApplicationResponse> queue() { return service.getQueue(); }

    @GetMapping("/{applicationId}")
    @Operation(summary = "Получить заявку для ручного рассмотрения", description = "Возвращает основные данные заявки сотруднику банка.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Заявка получена"), @ApiResponse(responseCode = "403", description = "Недостаточно прав сотрудника"), @ApiResponse(responseCode = "404", description = "Заявка не найдена")})
    public ManualReviewApplicationResponse application(@Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId) { return service.getApplication(applicationId); }

    @PostMapping("/{applicationId}/decision")
    @Operation(summary = "Принять ручное решение", description = "Одобряет, отклоняет или формирует контрпредложение для заявки в MANUAL_REVIEW. Решение, оффер, статус и история сохраняются атомарно.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Ручное решение сохранено"), @ApiResponse(responseCode = "400", description = "Некорректные условия контрпредложения"), @ApiResponse(responseCode = "403", description = "Недостаточно прав сотрудника"), @ApiResponse(responseCode = "404", description = "Заявка не найдена"), @ApiResponse(responseCode = "409", description = "Заявка уже не находится на ручном рассмотрении")})
    public CreditDecisionResponse decide(@Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId, @Valid @RequestBody ManualDecisionRequest request) { return service.decide(applicationId, request); }

    @PostMapping("/{applicationId}/information-requests")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Запросить дополнительные сведения", description = "Создаёт открытый запрос уточнений и переводит заявку из MANUAL_REVIEW в NEEDS_INFO.")
    @ApiResponses({@ApiResponse(responseCode = "204", description = "Запрос уточнений создан"), @ApiResponse(responseCode = "403", description = "Недостаточно прав сотрудника"), @ApiResponse(responseCode = "404", description = "Заявка не найдена"), @ApiResponse(responseCode = "409", description = "Заявка уже не находится на ручном рассмотрении")})
    public void requestInformation(@Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId, @Valid @RequestBody CreateInformationRequest request) { service.requestInformation(applicationId, request); }
}
