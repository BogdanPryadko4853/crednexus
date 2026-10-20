package com.crednexus.company.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.crednexus.auth.entity.User;
import com.crednexus.auth.repository.UserRepository;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.dto.AddCompanyMemberRequest;
import com.crednexus.company.dto.CreateCompanyRequest;
import com.crednexus.company.entity.Company;
import com.crednexus.company.entity.CompanyMember;
import com.crednexus.company.entity.CompanyMemberRole;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.company.repository.CompanyRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class CompanyServiceTest {

    @Mock
    private CompanyRepository companyRepository;

    @Mock
    private CompanyMemberRepository companyMemberRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Captor
    private ArgumentCaptor<CompanyMember> companyMemberCaptor;

    @InjectMocks
    private CompanyService companyService;

    @Test
    void createsCompanyAndOwnerMembershipForCurrentUser() {
        User currentUser = user("current-user");
        when(currentUserProvider.getCurrentUser()).thenReturn(currentUser);
        when(companyRepository.existsByInn("7701234567")).thenReturn(false);
        when(companyRepository.save(any(Company.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(companyMemberRepository.save(any(CompanyMember.class))).thenAnswer(invocation -> invocation.getArgument(0));

        companyService.createCompany(new CreateCompanyRequest(
                "7701234567", "1027700132195", "CredNexus", "OOO", "ACTIVE"
        ));

        verify(companyMemberRepository).save(companyMemberCaptor.capture());
        CompanyMember membership = companyMemberCaptor.getValue();
        assertThat(membership.getUser()).isSameAs(currentUser);
        assertThat(membership.getMemberRole()).isEqualTo(CompanyMemberRole.OWNER);
        assertThat(membership.isActive()).isTrue();
        assertThat(membership.isCanApply()).isTrue();
    }

    @Test
    void allowsOwnerToAddRepresentative() {
        UUID companyId = UUID.randomUUID();
        User owner = user("owner");
        User representative = user("representative");
        Company company = new Company("7701234567", "1027700132195", "CredNexus", "OOO", "ACTIVE");
        CompanyMember ownerMembership = new CompanyMember(
                owner, company, "Owner", true, true, CompanyMemberRole.OWNER
        );

        when(currentUserProvider.getCurrentUser()).thenReturn(owner);
        when(companyMemberRepository.findByUser_IdAndCompany_Id(owner.getId(), companyId))
                .thenReturn(Optional.of(ownerMembership));
        when(companyMemberRepository.existsByUser_IdAndCompany_Id(representative.getId(), companyId)).thenReturn(false);
        when(companyRepository.findById(companyId)).thenReturn(Optional.of(company));
        when(userRepository.findById(representative.getId())).thenReturn(Optional.of(representative));
        when(companyMemberRepository.save(any(CompanyMember.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = companyService.addRepresentative(
                companyId,
                new AddCompanyMemberRequest(representative.getId(), "Accountant", true)
        );

        assertThat(response.role()).isEqualTo(CompanyMemberRole.REPRESENTATIVE);
        assertThat(response.userId()).isEqualTo(representative.getId());
        assertThat(response.canApply()).isTrue();
    }

    @Test
    void rejectsRepresentativeWhoTriesToManageCompanyMembers() {
        UUID companyId = UUID.randomUUID();
        User representative = user("representative");
        Company company = new Company("7701234567", "1027700132195", "CredNexus", "OOO", "ACTIVE");
        CompanyMember membership = new CompanyMember(
                representative, company, "Accountant", false, true, CompanyMemberRole.REPRESENTATIVE
        );

        when(currentUserProvider.getCurrentUser()).thenReturn(representative);
        when(companyMemberRepository.findByUser_IdAndCompany_Id(representative.getId(), companyId))
                .thenReturn(Optional.of(membership));

        assertThatThrownBy(() -> companyService.addRepresentative(
                companyId,
                new AddCompanyMemberRequest(UUID.randomUUID(), "Director", true)
        ))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN)
                );
    }

    private User user(String keycloakId) {
        User user = new User(keycloakId, keycloakId + "@crednexus.local", keycloakId);
        UUID id = UUID.nameUUIDFromBytes(keycloakId.getBytes());
        org.springframework.test.util.ReflectionTestUtils.setField(user, "id", id);
        return user;
    }
}
