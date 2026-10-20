package com.crednexus.company.repository;

import com.crednexus.company.entity.CompanyMember;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyMemberRepository extends JpaRepository<CompanyMember, UUID> {
}
