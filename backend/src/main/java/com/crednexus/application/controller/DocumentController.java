package com.crednexus.application.controller;

import com.crednexus.application.dto.DocumentResponse;
import com.crednexus.application.entity.DocumentType;
import com.crednexus.application.service.DocumentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import java.util.List;
import java.util.UUID;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
@Tag(name = "Документы", description = "Загрузка и защищённое получение документов кредитной заявки.")
@SecurityRequirement(name = "bearerAuth")
public class DocumentController {
    private final DocumentService service;

    public DocumentController(DocumentService service) {
        this.service = service;
    }

    @PostMapping(value = "/loan-applications/{applicationId}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Загрузить документ", description = "Загружает PDF, PNG или JPEG в защищённое S3-совместимое хранилище. Требуется активное членство и canApply.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Документ загружен"), @ApiResponse(responseCode = "400", description = "Недопустимый формат или размер файла"), @ApiResponse(responseCode = "403", description = "Нет доступа к компании"), @ApiResponse(responseCode = "502", description = "Хранилище недоступно")})
    public DocumentResponse upload(@PathVariable UUID applicationId, @RequestParam DocumentType type, @RequestParam MultipartFile file, @RequestParam(required = false) UUID informationRequestId) {
        return service.upload(applicationId, type, file, informationRequestId);
    }

    @GetMapping("/loan-applications/{applicationId}/documents")
    @Operation(summary = "Получить документы заявки", description = "Возвращает метаданные документов активному представителю компании.")
    public List<DocumentResponse> list(@PathVariable UUID applicationId) {
        return service.list(applicationId);
    }

    @GetMapping("/documents/{documentId}/download")
    @Operation(summary = "Скачать документ", description = "Передаёт файл через backend после проверки доступа к компании заявки.")
    public ResponseEntity<InputStreamResource> download(@PathVariable UUID documentId) {
        var d = service.download(documentId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(d.contentType())).contentLength(d.size()).header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + d.fileName() + "\"").body(new InputStreamResource(d.stream()));
    }
}
