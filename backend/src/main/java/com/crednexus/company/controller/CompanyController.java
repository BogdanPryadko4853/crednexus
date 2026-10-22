package com.crednexus.company.controller;

import com.crednexus.company.dto.AddCompanyMemberRequest;
import com.crednexus.company.dto.CompanyMemberResponse;
import com.crednexus.company.dto.CompanyResponse;
import com.crednexus.company.dto.CreateCompanyRequest;
import com.crednexus.company.service.CompanyService;
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
@RequestMapping("/api/companies")
@Tag(name = "Компании", description = "Компании-заёмщики и полномочия их представителей.")
@SecurityRequirement(name = "bearerAuth")
public class CompanyController {

    private final CompanyService companyService;

    public CompanyController(CompanyService companyService) {
        this.companyService = companyService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            summary = "Создать компанию",
            description = "Создаёт компанию-заёмщика и автоматически назначает текущего пользователя её владельцем с правом подачи заявок."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Компания создана"),
            @ApiResponse(responseCode = "400", description = "Некорректные ИНН, ОГРН/ОГРНИП или обязательные поля"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "409", description = "Компания с таким ИНН уже существует")
    })
    public CompanyResponse createCompany(@Valid @RequestBody CreateCompanyRequest request) {
        return companyService.createCompany(request);
    }

    @GetMapping
    @Operation(
            summary = "Получить доступные компании",
            description = "Возвращает компании, в которых текущий пользователь является активным представителем."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Список компаний получен"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк")
    })
    public List<CompanyResponse> getCurrentUserCompanies() {
        return companyService.getCurrentUserCompanies();
    }

    @GetMapping("/{companyId}")
    @Operation(
            summary = "Получить компанию",
            description = "Возвращает сведения о компании и правах текущего пользователя в ней."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Компания получена"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Нет активного доступа к компании")
    })
    public CompanyResponse getCompany(
            @Parameter(description = "Идентификатор компании", required = true) @PathVariable UUID companyId
    ) {
        return companyService.getCompany(companyId);
    }

    @PostMapping("/{companyId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            summary = "Добавить представителя компании",
            description = "Добавляет существующего пользователя как представителя компании. Операция доступна только владельцу компании."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Представитель добавлен"),
            @ApiResponse(responseCode = "400", description = "Некорректные данные представителя"),
            @ApiResponse(responseCode = "401", description = "JWT отсутствует, недействителен или истёк"),
            @ApiResponse(responseCode = "403", description = "Текущий пользователь не является владельцем компании"),
            @ApiResponse(responseCode = "404", description = "Компания или пользователь не найдены"),
            @ApiResponse(responseCode = "409", description = "Пользователь уже является представителем компании")
    })
    public CompanyMemberResponse addRepresentative(
            @Parameter(description = "Идентификатор компании", required = true) @PathVariable UUID companyId,
            @Valid @RequestBody AddCompanyMemberRequest request
    ) {
        return companyService.addRepresentative(companyId, request);
    }
}
