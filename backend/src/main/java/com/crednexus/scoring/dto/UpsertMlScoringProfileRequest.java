package com.crednexus.scoring.dto;

import java.util.Map;
import jakarta.validation.constraints.NotNull;

public record UpsertMlScoringProfileRequest(@NotNull Map<String, Object> profile) { }
