package com.crednexus.product.repository;

import com.crednexus.product.entity.CreditProduct;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditProductRepository extends JpaRepository<CreditProduct, UUID> {
}
