package com.crednexus.integration.ml;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

/** Transport example for Java 25. Serialization and business policy belong to the caller. */
public final class CredNexusMlClient implements AutoCloseable {
    private final URI baseUrl;
    private final HttpClient http;

    public CredNexusMlClient(URI baseUrl) {
        if (!("http".equals(baseUrl.getScheme()) || "https".equals(baseUrl.getScheme()))
                || baseUrl.getHost() == null || baseUrl.getUserInfo() != null
                || baseUrl.getQuery() != null || baseUrl.getFragment() != null
                || !(baseUrl.getPath().isEmpty() || baseUrl.getPath().equals("/"))) {
            throw new IllegalArgumentException("ML base URL must contain only scheme, host and port");
        }
        this.baseUrl = baseUrl;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public CompletableFuture<String> score(String json) {
        return post("/v1/score", json);
    }

    public CompletableFuture<String> forecast(String json) {
        return post("/v1/forecast", json);
    }

    public CompletableFuture<String> cashGap(String json) {
        return post("/v1/cash-gap", json);
    }

    public CompletableFuture<String> ready() {
        return send(request("/health/ready").GET().build());
    }

    private CompletableFuture<String> post(String path, String json) {
        return send(request(path).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build());
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(baseUrl.resolve(path))
                .timeout(Duration.ofSeconds(10)).header("Accept", "application/json");
    }

    private CompletableFuture<String> send(HttpRequest request) {
        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                .thenApply(response -> {
                    if (response.statusCode() != 200) {
                        throw new MlHttpException(response.statusCode(), response.body());
                    }
                    return response.body();
                });
    }

    @Override
    public void close() {
        http.close();
    }

    public static final class MlHttpException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final int status;
        private final String responseBody;

        public MlHttpException(int status, String responseBody) {
            super("ML API returned HTTP " + status);
            this.status = status;
            this.responseBody = responseBody;
        }

        public int status() { return status; }
        public String responseBody() { return responseBody; }
    }

    /** CLI for synthetic fixtures only; successful results are printed to stdout. */
    public static void main(String[] args) throws IOException {
        if (args.length < 2 || args.length > 3) {
            throw new IllegalArgumentException("Usage: <base-url> <ready|score|forecast|cash-gap> [request.json]");
        }
        try (var client = new CredNexusMlClient(URI.create(args[0]))) {
            CompletableFuture<String> result;
            if (args[1].equals("ready") && args.length == 2) {
                result = client.ready();
            } else {
                if (args.length != 3) throw new IllegalArgumentException("A request JSON file is required");
                String json = Files.readString(Path.of(args[2]), StandardCharsets.UTF_8);
                result = switch (args[1]) {
                    case "score" -> client.score(json);
                    case "forecast" -> client.forecast(json);
                    case "cash-gap" -> client.cashGap(json);
                    default -> throw new IllegalArgumentException("Unknown operation");
                };
            }
            System.out.println(result.join());
        }
    }
}
