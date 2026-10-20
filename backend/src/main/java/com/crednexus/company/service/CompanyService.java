package com.crednexus.company.service;

import com.crednexus.auth.entity.User;
import com.crednexus.auth.repository.UserRepository;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.dto.AddCompanyMemberRequest;
import com.crednexus.company.dto.CompanyMemberResponse;
import com.crednexus.company.dto.CompanyResponse;
import com.crednexus.company.dto.CreateCompanyRequest;
import com.crednexus.company.entity.Company;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.entity.CompanyMemberRole;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.company.repository.CompanyRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CompanyService {

    private final CompanyRepository companyRepository;
    private final CompanyMemberRepository companyMemberRepository;
    private final UserRepository userRepository;
    private final CurrentUserProvider currentUserProvider;

    public CompanyService(
            CompanyRepository companyRepository,
            CompanyMemberRepository companyMemberRepository,
            UserRepository userRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.companyRepository = companyRepository;
        this.companyMemberRepository = companyMemberRepository;
        this.userRepository = userRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional
    public CompanyResponse createCompany(CreateCompanyRequest request) {
        if (companyRepository.existsByInn(request.inn())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Company with this INN already exists");
        }

        User currentUser = currentUserProvider.getCurrentUser();
        Company company = companyRepository.save(new Company(
                request.inn(),
                request.ogrnOrOgrnip(),
                request.name(),
                request.legalForm(),
                request.status()
        ));
        CompanyMember ownerMembership = companyMemberRepository.save(new CompanyMember(
                currentUser,
                company,
                "Owner",
                true,
                true,
                CompanyMemberRole.OWNER
        ));

        return toCompanyResponse(company, ownerMembership);
    }

    @Transactional(readOnly = true)
    public List<CompanyResponse> getCurrentUserCompanies() {
        User currentUser = currentUserProvider.getCurrentUser();
        return companyMemberRepository.findAllByUser_IdAndActiveTrue(currentUser.getId()).stream()
                .map(membership -> toCompanyResponse(membership.getCompany(), membership))
                .toList();
    }

    @Transactional(readOnly = true)
    public CompanyResponse getCompany(UUID companyId) {
        CompanyMember membership = getActiveMembership(currentUserProvider.getCurrentUser().getId(), companyId);
        return toCompanyResponse(membership.getCompany(), membership);
    }

    @Transactional
    public CompanyMemberResponse addRepresentative(UUID companyId, AddCompanyMemberRequest request) {
        User currentUser = currentUserProvider.getCurrentUser();
        requireOwner(currentUser.getId(), companyId);

        if (companyMemberRepository.existsByUser_IdAndCompany_Id(request.userId(), companyId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User is already a company member");
        }

        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        User representative = userRepository.findById(request.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        CompanyMember membership = companyMemberRepository.save(new CompanyMember(
                representative,
                company,
                request.position(),
                request.canApply(),
                true,
                CompanyMemberRole.REPRESENTATIVE
        ));

        return toCompanyMemberResponse(membership);
    }

    private CompanyMember getActiveMembership(UUID userId, UUID companyId) {
        return companyMemberRepository.findByUser_IdAndCompany_Id(userId, companyId)
                .filter(CompanyMember::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company access is denied"));
    }

    private void requireOwner(UUID userId, UUID companyId) {
        CompanyMember membership = getActiveMembership(userId, companyId);

        if (membership.getMemberRole() != CompanyMemberRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Company owner role is required");
        }
    }

    private CompanyResponse toCompanyResponse(Company company, CompanyMember membership) {
        return new CompanyResponse(
                company.getId(),
                company.getInn(),
                company.getOgrnOrOgrnip(),
                company.getName(),
                company.getLegalForm(),
                company.getStatus(),
                membership.getMemberRole(),
                membership.isCanApply()
        );
    }

    private CompanyMemberResponse toCompanyMemberResponse(CompanyMember membership) {
        User user = membership.getUser();
        return new CompanyMemberResponse(
                membership.getId(),
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                membership.getPosition(),
                membership.isCanApply(),
                membership.isActive(),
                membership.getMemberRole()
        );
    }
}
