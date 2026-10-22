package com.crednexus.scoring.service;

import com.crednexus.application.entity.*;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.scoring.dto.UpsertMlScoringProfileRequest;
import com.crednexus.scoring.entity.MlScoringProfile;
import com.crednexus.scoring.repository.MlScoringProfileRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.beans.factory.annotation.Qualifier;

import java.util.*;

import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MlScoringProfileService {
    private final LoanApplicationRepository applications;
    private final MlScoringProfileRepository profiles;
    private final CurrentUserProvider users;
    private final CompanyMemberRepository members;
    private final ObjectMapper json;

    public MlScoringProfileService(LoanApplicationRepository applications, MlScoringProfileRepository profiles, CurrentUserProvider users, CompanyMemberRepository members,
                                  @Qualifier("mlObjectMapper") ObjectMapper json) {
        this.applications = applications;
        this.profiles = profiles;
        this.users = users;
        this.members = members;
        this.json = json;
    }

    @Transactional
    public Map<String, Object> upsert(UUID id, UpsertMlScoringProfileRequest request) {
        LoanApplication app = applications.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        User user = users.getCurrentUser();
        members.findByUser_IdAndCompany_Id(user.getId(), app.getCompany().getId()).filter(m -> m.isActive() && m.isCanApply()).orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company authority is denied"));
        if (app.getStatus() != LoanApplicationStatus.DRAFT)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "ML profile can only be changed for a draft");
        JsonNode payload = json.valueToTree(request.profile());
        validate(payload);
        profiles.findByApplication_Id(id).ifPresentOrElse(p -> p.replace(payload), () -> profiles.save(new MlScoringProfile(app, payload)));
        return request.profile();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(UUID id) {
        LoanApplication app = applications.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
        User u = users.getCurrentUser();
        members.findByUser_IdAndCompany_Id(u.getId(), app.getCompany().getId()).filter(m -> m.isActive()).orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company access is denied"));
        JsonNode payload = profiles.findByApplication_Id(id).map(MlScoringProfile::getPayload)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "ML scoring profile not found"));
        return json.convertValue(payload, new TypeReference<Map<String, Object>>() { });
    }

    private void validate(JsonNode p) {
        if (!p.isObject() || !p.hasNonNull("as_of_month") || !p.has("company") || !p.has("history") || !p.has("financial_snapshot"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ML profile requires as_of_month, company, history and financial_snapshot");
        if (!p.path("history").isArray() || p.path("history").size() < 3 || p.path("history").size() > 120)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ML history must contain from 3 to 120 months");
    }
}
