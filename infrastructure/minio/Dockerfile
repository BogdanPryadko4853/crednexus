# Community MinIO images are no longer available from the original registries.
# Build the existing server version from official, versioned Go modules instead.
FROM golang:1.24-alpine AS builder
ENV CGO_ENABLED=0 GOBIN=/out
RUN go install github.com/minio/minio@RELEASE.2024-12-18T13-15-44Z
RUN go install github.com/minio/mc@RELEASE.2024-11-21T17-21-54Z
RUN cp /go/pkg/mod/github.com/minio/minio@v0.0.0-20241218131544-16f8cf1c52f0/LICENSE /out/LICENSE.minio \
    && cp /go/pkg/mod/github.com/minio/mc@v0.0.0-20241121172154-1681e4497c09/LICENSE /out/LICENSE.mc

FROM alpine:3.23
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
# Keep the original image's UID (root) so existing named volumes stay readable.
RUN apk add --no-cache ca-certificates curl && mkdir /data
COPY --from=builder /out/minio /out/mc /usr/local/bin/
COPY --from=builder /out/LICENSE.minio /out/LICENSE.mc /licenses/
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
