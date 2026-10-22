package com.crednexus.scoring.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;

public record UpsertMlScoringProfileRequest(@NotNull JsonNode profile) { }
