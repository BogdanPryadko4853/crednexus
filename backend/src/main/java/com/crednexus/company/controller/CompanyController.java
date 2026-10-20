package com.crednexus.company.controller;

import com.crednexus.company.dto.AddCompanyMemberRequest;
import com.crednexus.company.dto.CompanyMemberResponse;
import com.crednexus.company.dto.CompanyResponse;
import com.crednexus.company.dto.CreateCompanyRequest;
import com.crednexus.company.service.CompanyService;
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
public class CompanyController {

    private final CompanyService companyService;

    public CompanyController(CompanyService companyService) {
        this.companyService = companyService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CompanyResponse createCompany(@Valid @RequestBody CreateCompanyRequest request) {
        return companyService.createCompany(request);
    }

    @GetMapping
    public List<CompanyResponse> getCurrentUserCompanies() {
        return companyService.getCurrentUserCompanies();
    }

    @GetMapping("/{companyId}")
    public CompanyResponse getCompany(@PathVariable UUID companyId) {
        return companyService.getCompany(companyId);
    }

    @PostMapping("/{companyId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    public CompanyMemberResponse addRepresentative(
            @PathVariable UUID companyId,
            @Valid @RequestBody AddCompanyMemberRequest request
    ) {
        return companyService.addRepresentative(companyId, request);
    }
}
