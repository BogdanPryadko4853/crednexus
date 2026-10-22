package com.crednexus.application.controller;

import com.crednexus.application.dto.AnswerInformationRequest;
import com.crednexus.application.dto.InformationRequestResponse;
import com.crednexus.application.service.InformationRequestService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/loan-applications/{applicationId}/information-requests")
@Tag(name = "Запросы уточнений", description = "Ответы клиента на сведения, запрошенные при рассмотрении заявки.")
@SecurityRequirement(name = "bearerAuth")
public class InformationRequestController {
    private final InformationRequestService service;
    public InformationRequestController(InformationRequestService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "Получить запросы уточнений", description = "Возвращает запросы по заявке активному представителю компании.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Запросы получены"), @ApiResponse(responseCode = "403", description = "Нет доступа к компании"), @ApiResponse(responseCode = "404", description = "Заявка не найдена")})
    public List<InformationRequestResponse> getAll(@Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId) { return service.getAll(applicationId); }

    @PostMapping("/{requestId}/answer")
    @Operation(summary = "Ответить на запрос уточнений", description = "Сохраняет ответ. После ответа на последний открытый запрос заявка возвращается в SUBMITTED и автоматически запускает повторную проверку.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Ответ сохранён"), @ApiResponse(responseCode = "403", description = "Нет права canApply или доступа к компании"), @ApiResponse(responseCode = "404", description = "Заявка или запрос не найдены"), @ApiResponse(responseCode = "409", description = "Заявка не в NEEDS_INFO либо запрос уже закрыт")})
    public InformationRequestResponse answer(@Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId,
                                             @Parameter(description = "Идентификатор запроса", required = true) @PathVariable UUID requestId,
                                             @Valid @RequestBody AnswerInformationRequest request) { return service.answer(applicationId, requestId, request); }
}
