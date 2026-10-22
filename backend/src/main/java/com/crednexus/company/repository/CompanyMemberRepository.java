package com.crednexus.company.repository;

import com.crednexus.company.entity.CompanyMember;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyMemberRepository extends JpaRepository<CompanyMember, UUID> {

    List<CompanyMember> findAllByUser_IdAndActiveTrue(UUID userId);

    Optional<CompanyMember> findByUser_IdAndCompany_Id(UUID userId, UUID companyId);

    boolean existsByUser_IdAndCompany_Id(UUID userId, UUID companyId);
}
