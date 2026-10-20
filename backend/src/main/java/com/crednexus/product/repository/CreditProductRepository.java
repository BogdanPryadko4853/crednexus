package com.crednexus.product.repository;

import com.crednexus.product.entity.CreditProduct;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditProductRepository extends JpaRepository<CreditProduct, UUID> {

    List<CreditProduct> findAllByActiveTrueOrderByNameAsc();

    Optional<CreditProduct> findByIdAndActiveTrue(UUID id);
}
