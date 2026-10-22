package com.crednexus.scoring.controller;
import com.crednexus.scoring.dto.UpsertMlScoringProfileRequest;
import com.crednexus.scoring.service.MlScoringProfileService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/loan-applications/{applicationId}/ml-scoring-profile") @Tag(name="ML-профиль скоринга",description="Данные для обязательного ML-скоринга.") @SecurityRequirement(name="bearerAuth")
public class MlScoringProfileController { private final MlScoringProfileService service; public MlScoringProfileController(MlScoringProfileService service){this.service=service;}
 @PutMapping @Operation(summary="Сохранить ML-профиль",description="Сохраняет месячный финансовый профиль черновика. Без него отправка заявки невозможна.") public JsonNode upsert(@PathVariable UUID applicationId,@Valid @RequestBody UpsertMlScoringProfileRequest request){return service.upsert(applicationId,request);}
 @GetMapping @Operation(summary="Получить ML-профиль",description="Возвращает сохранённый ML-профиль активному представителю компании.") public JsonNode get(@PathVariable UUID applicationId){return service.get(applicationId);}
}
