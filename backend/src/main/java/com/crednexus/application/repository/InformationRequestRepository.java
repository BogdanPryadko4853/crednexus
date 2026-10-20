package com.crednexus.application.repository;

import com.crednexus.application.entity.InformationRequest;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InformationRequestRepository extends JpaRepository<InformationRequest, UUID> {
}
