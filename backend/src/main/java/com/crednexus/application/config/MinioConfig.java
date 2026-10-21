package com.crednexus.application.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {
    @Bean
    MinioClient minioClient(@Value("${storage.s3.endpoint}") String endpoint,
                            @Value("${storage.s3.access-key}") String accessKey,
                            @Value("${storage.s3.secret-key}") String secretKey) {
        return MinioClient.builder().endpoint(endpoint).credentials(accessKey, secretKey).build();
    }
}
