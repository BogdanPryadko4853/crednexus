package com.crednexus.application.controller;

import com.crednexus.application.dto.CreateLoanApplicationRequest;
import com.crednexus.application.dto.ApplicationStatusHistoryResponse;
import com.crednexus.application.dto.FinancialSnapshotResponse;
import com.crednexus.application.dto.LoanApplicationResponse;
import com.crednexus.application.dto.UpsertFinancialSnapshotRequest;
import com.crednexus.application.dto.UpdateLoanApplicationRequest;
import com.crednexus.application.service.FinancialSnapshotService;
import com.crednexus.application.service.ApplicationHistoryService;
import com.crednexus.application.service.LoanApplicationService;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;

@RestController
@RequestMapping("/api")
@Tag(name = "Кредитные заявки", description = "Создание и ведение черновиков кредитных заявок.")
@SecurityRequirement(name = "bearerAuth")
public class LoanApplicationController {

    private final LoanApplicationService loanApplicationService;
    private final FinancialSnapshotService financialSnapshotService;
    private final ApplicationHistoryService applicationHistoryService;

    public LoanApplicationController(
            LoanApplicationService loanApplicationService,
            FinancialSnapshotService financialSnapshotService,
            ApplicationHistoryService applicationHistoryService
    ) {
        this.loanApplicationService = loanApplicationService;
        this.financialSnapshotService = financialSnapshotService;
        this.applicationHistoryService = applicationHistoryService;
    }

    @PostMapping("/companies/{companyId}/loan-applications")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            summary = "Создать черновик кредитной заявки",
            description = "Создаёт заявку в статусе DRAFT для компании. Требуются активное членство в компании и право canApply. Продукт должен быть активен; проверка его лимитов выполняется позднее при отправке заявки."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Черновик заявки создан"),
            @ApiResponse(responseCode = "400", description = "Некорректные обязательные поля заявки"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет доступа к компании или права на создание заявок"),
            @ApiResponse(responseCode = "404", description = "Активный кредитный продукт не найден")
    })
    public LoanApplicationResponse createDraft(
            @Parameter(description = "Идентификатор компании-заёмщика", required = true) @PathVariable UUID companyId,
            @Valid @RequestBody CreateLoanApplicationRequest request
    ) {
        return loanApplicationService.createDraft(companyId, request);
    }

    @GetMapping("/loan-applications")
    @Operation(
            summary = "Получить доступные кредитные заявки",
            description = "Возвращает заявки компаний, в которых текущий пользователь является активным представителем, от новых к старым по времени обновления."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Список заявок получен"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк")
    })
    public List<LoanApplicationResponse> getCurrentUserApplications() {
        return loanApplicationService.getCurrentUserApplications();
    }

    @GetMapping("/loan-applications/{applicationId}")
    @Operation(
            summary = "Получить кредитную заявку",
            description = "Возвращает заявку, если текущий пользователь является активным представителем её компании."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Заявка получена"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет активного доступа к компании заявки"),
            @ApiResponse(responseCode = "404", description = "Заявка не найдена")
    })
    public LoanApplicationResponse getApplication(
            @Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId
    ) {
        return loanApplicationService.getApplication(applicationId);
    }

    @GetMapping("/loan-applications/{applicationId}/history")
    @Operation(summary = "Получить историю статусов заявки", description = "Возвращает хронологию переходов статусов активному представителю компании. Технические детали внутренних сбоев не раскрываются.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "История получена"), @ApiResponse(responseCode = "403", description = "Нет доступа к компании"), @ApiResponse(responseCode = "404", description = "Заявка не найдена")})
    public List<ApplicationStatusHistoryResponse> getHistory(
            @Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId) {
        return applicationHistoryService.getHistory(applicationId);
    }

    @PatchMapping("/loan-applications/{applicationId}")
    @Operation(
            summary = "Изменить черновик кредитной заявки",
            description = "Частично обновляет продукт, сумму, срок или цель заявки. Операция доступна только автору заявки, только при статусе DRAFT и при сохранении активного доступа к компании."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Черновик заявки обновлён"),
            @ApiResponse(responseCode = "400", description = "Некорректные поля заявки"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет доступа к компании или текущий пользователь не является автором"),
            @ApiResponse(responseCode = "404", description = "Заявка или активный кредитный продукт не найдены"),
            @ApiResponse(responseCode = "409", description = "Заявка уже не является черновиком")
    })
    public LoanApplicationResponse updateDraft(
            @Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId,
            @Valid @RequestBody UpdateLoanApplicationRequest request
    ) {
        return loanApplicationService.updateDraft(applicationId, request);
    }

    @PostMapping("/loan-applications/{applicationId}/submit")
    @Operation(
            summary = "Отправить кредитную заявку",
            description = "Переводит собственный черновик из DRAFT в SUBMITTED. Требуются финансовый снимок, активный кредитный продукт и соответствие суммы и срока его лимитам. Переход и история статуса сохраняются в одной транзакции."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Заявка отправлена"),
            @ApiResponse(responseCode = "400", description = "Сумма или срок не соответствуют лимитам продукта"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет доступа к компании или текущий пользователь не является автором"),
            @ApiResponse(responseCode = "404", description = "Заявка не найдена"),
            @ApiResponse(responseCode = "409", description = "Заявка уже не является черновиком, не заполнен финансовый снимок или продукт неактивен")
    })
    public LoanApplicationResponse submitApplication(
            @Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId
    ) {
        return loanApplicationService.submitApplication(applicationId);
    }

    @PutMapping("/loan-applications/{applicationId}/financial-snapshot")
    @Operation(
            summary = "Создать или заменить финансовый снимок",
            description = "Полностью создаёт или заменяет финансовые показатели заявки. Доступно только автору заявки в статусе DRAFT при активном доступе к компании."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Финансовый снимок сохранён"),
            @ApiResponse(responseCode = "400", description = "Некорректные или отсутствующие финансовые показатели"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет доступа к компании или текущий пользователь не является автором"),
            @ApiResponse(responseCode = "404", description = "Заявка не найдена"),
            @ApiResponse(responseCode = "409", description = "Заявка уже не является черновиком")
    })
    public FinancialSnapshotResponse upsertFinancialSnapshot(
            @Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId,
            @Valid @RequestBody UpsertFinancialSnapshotRequest request
    ) {
        return financialSnapshotService.upsertFinancialSnapshot(applicationId, request);
    }

    @GetMapping("/loan-applications/{applicationId}/financial-snapshot")
    @Operation(
            summary = "Получить финансовый снимок",
            description = "Возвращает финансовые показатели заявки. Доступно активным представителям компании-заёмщика."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Финансовый снимок получен"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет активного доступа к компании заявки"),
            @ApiResponse(responseCode = "404", description = "Заявка или финансовый снимок не найдены")
    })
    public FinancialSnapshotResponse getFinancialSnapshot(
            @Parameter(description = "Идентификатор заявки", required = true) @PathVariable UUID applicationId
    ) {
        return financialSnapshotService.getFinancialSnapshot(applicationId);
    }
}
