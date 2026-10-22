package com.crednexus.decision.controller;

import com.crednexus.decision.dto.OfferActionResponse;
import com.crednexus.decision.service.OfferService;
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
@RequestMapping("/api/loan-applications/{applicationId}/offer")
@Tag(name = "Кредитные предложения", description = "Принятие или отклонение актуального кредитного предложения.")
@SecurityRequirement(name = "bearerAuth")
public class OfferController {

    private final OfferService offerService;

    public OfferController(OfferService offerService) {
        this.offerService = offerService;
    }

    @PostMapping("/accept")
    @Operation(summary = "Принять кредитное предложение", description = "Принимает актуальный оффер только до expiresAt. Требуется JWT, активное членство в компании и право canApply. Повторный запрос после успешного принятия безопасно возвращает текущее состояние без повторных побочных эффектов.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Оффер принят"), @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"), @ApiResponse(responseCode = "403", description = "Нет полномочий действовать от имени компании"), @ApiResponse(responseCode = "404", description = "Заявка или оффер не найдены"), @ApiResponse(responseCode = "409", description = "Оффер неактивен, истёк или заявка не находится в OFFERED")})
    public OfferActionResponse accept(@Parameter(description = "Идентификатор кредитной заявки", required = true) @PathVariable UUID applicationId) {
        return offerService.accept(applicationId);
    }

    @PostMapping("/decline")
    @Operation(summary = "Отклонить кредитное предложение", description = "Отклоняет актуальный оффер только до expiresAt. Требуется JWT, активное членство в компании и право canApply. Повторный запрос после успешного отклонения безопасно возвращает текущее состояние без повторных побочных эффектов.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Оффер отклонён"), @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"), @ApiResponse(responseCode = "403", description = "Нет полномочий действовать от имени компании"), @ApiResponse(responseCode = "404", description = "Заявка или оффер не найдены"), @ApiResponse(responseCode = "409", description = "Оффер неактивен, истёк или заявка не находится в OFFERED")})
    public OfferActionResponse decline(@Parameter(description = "Идентификатор кредитной заявки", required = true) @PathVariable UUID applicationId) {
        return offerService.decline(applicationId);
    }
}
