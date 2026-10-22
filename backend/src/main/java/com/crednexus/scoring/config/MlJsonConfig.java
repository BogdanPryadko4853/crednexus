package com.crednexus.scoring.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class MlJsonConfig {

    @Bean("mlObjectMapper")
    ObjectMapper mlObjectMapper() {
        return JsonMapper.builder().build();
    }
}
