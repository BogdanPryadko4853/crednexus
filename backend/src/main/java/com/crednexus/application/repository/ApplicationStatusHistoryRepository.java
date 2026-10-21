package com.crednexus.application.repository;

import com.crednexus.application.entity.ApplicationStatusHistory;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationStatusHistoryRepository extends JpaRepository<ApplicationStatusHistory, UUID> {

    List<ApplicationStatusHistory> findAllByApplication_IdOrderByOccurredAtAsc(UUID applicationId);
}
